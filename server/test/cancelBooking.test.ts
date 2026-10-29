import '../src/config/env'; // loads server/.env so DATABASE_URL is set when running outside Docker
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import jwt from 'jsonwebtoken';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import prisma from '../src/lib/prisma';
import { cancelBooking, confirmHold, createBooking, holdSeat } from '../src/modules/bookings/bookings.service';
import { createFixtures } from './support/fixtures';

// Real database and real Express app: ownership is enforced by the update query itself,
// so mocks would not prove anything.
describe.skipIf(!process.env.DATABASE_URL)('cancelling bookings', () => {
  const { makeUser, makeSeats, cleanup } = createFixtures('cancelbooking');

  let server: Server;
  let baseUrl: string;
  let signToken: typeof import('../src/lib/jwt.js').signToken;

  beforeAll(async () => {
    vi.stubEnv('JWT_SECRET', 'test-secret-for-cancel-tests');
    vi.resetModules(); // config/env was imported above, before the secret was set

    const app = (await import('../src/app.js')).default as unknown as import('express').Express;
    ({ signToken } = await import('../src/lib/jwt.js'));

    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    vi.unstubAllEnvs();
    await cleanup();
  });

  const tokenFor = (id: number, role: 'ATTENDEE' | 'ORGANIZER' = 'ATTENDEE') =>
    signToken({ id, email: `user${id}@test.local`, role });

  async function cancel(bookingId: number | string, token?: string) {
    const res = await fetch(`${baseUrl}/bookings/${bookingId}/cancel`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    return { status: res.status, json: (await res.json().catch(() => undefined)) as any };
  }

  // A user with one confirmed booking on a fresh seat.
  async function bookedSeat() {
    const owner = await makeUser();
    const [seat] = await makeSeats(1);
    const result = await createBooking(owner, seat);
    if (!('booking' in result)) throw new Error('setup: booking failed');
    return { owner, seat, bookingId: result.booking.id };
  }

  const stored = (id: number) => prisma.booking.findUniqueOrThrow({ where: { id } });

  describe('the owner', () => {
    it('can cancel their own booking', async () => {
      const { owner, bookingId } = await bookedSeat();

      const res = await cancel(bookingId, tokenFor(owner));

      expect(res).toMatchObject({ status: 200, json: { success: true } });
      const booking = await stored(bookingId);
      expect(booking.status).toBe('CANCELLED');
      expect(booking.cancelledAt).not.toBeNull();
    });

    it('frees the seat for others after cancelling', async () => {
      const { owner, seat, bookingId } = await bookedSeat();
      const other = await makeUser();

      await cancel(bookingId, tokenFor(owner));

      expect(await createBooking(other, seat)).toHaveProperty('booking');
    });

    it('can repeat a cancel without error and without changing the record', async () => {
      const { owner, bookingId } = await bookedSeat();

      await cancel(bookingId, tokenFor(owner));
      const first = await stored(bookingId);
      const again = await cancel(bookingId, tokenFor(owner));

      expect(again).toMatchObject({ status: 200, json: { success: true } });
      expect((await stored(bookingId)).cancelledAt).toEqual(first.cancelledAt);
    });

    it('gets 409 when trying to cancel a hold, which is not a booking', async () => {
      const owner = await makeUser();
      const [seat] = await makeSeats(1);
      const held = await holdSeat(owner, seat);
      if (!('booking' in held)) throw new Error('setup: hold failed');

      const res = await cancel(held.booking.id, tokenFor(owner));

      expect(res).toMatchObject({ status: 409, json: { error: 'Only confirmed bookings can be cancelled' } });
      expect((await stored(held.booking.id)).status).toBe('HELD');
    });
  });

  describe('someone else', () => {
    it('gets 403 and the booking stays confirmed', async () => {
      const { bookingId } = await bookedSeat();
      const attacker = await makeUser();

      const res = await cancel(bookingId, tokenFor(attacker));

      expect(res).toMatchObject({ status: 403, json: { error: 'You can only cancel your own bookings' } });
      const booking = await stored(bookingId);
      expect(booking.status).toBe('CONFIRMED');
      expect(booking.cancelledAt).toBeNull();
    });

    it('still gets 403 with the organizer role: roles do not bypass ownership', async () => {
      const { bookingId } = await bookedSeat();
      const organizer = await makeUser();

      const res = await cancel(bookingId, tokenFor(organizer, 'ORGANIZER'));

      expect(res.status).toBe(403);
      expect((await stored(bookingId)).status).toBe('CONFIRMED');
    });

    it('cannot cancel another user\'s hold either', async () => {
      const holder = await makeUser();
      const attacker = await makeUser();
      const [seat] = await makeSeats(1);
      const held = await holdSeat(holder, seat);
      if (!('booking' in held)) throw new Error('setup: hold failed');

      const res = await cancel(held.booking.id, tokenFor(attacker));

      expect(res.status).toBe(403);
      expect((await stored(held.booking.id)).status).toBe('HELD');
    });

    it('cannot cancel a cancelled booking that is not theirs, so nothing leaks about its state', async () => {
      const { owner, bookingId } = await bookedSeat();
      const attacker = await makeUser();
      await cancel(bookingId, tokenFor(owner));

      expect((await cancel(bookingId, tokenFor(attacker))).status).toBe(403);
    });

    it('cannot cancel a whole range of ids by walking through them', async () => {
      const victims = await Promise.all([bookedSeat(), bookedSeat(), bookedSeat()]);
      const attacker = await makeUser();

      const results = await Promise.all(victims.map((v) => cancel(v.bookingId, tokenFor(attacker))));

      expect(results.map((r) => r.status)).toEqual([403, 403, 403]);
      for (const v of victims) {
        expect((await stored(v.bookingId)).status).toBe('CONFIRMED');
      }
    });

    it('cannot cancel at the service level either', async () => {
      const { bookingId } = await bookedSeat();
      const attacker = await makeUser();

      expect(await cancelBooking(attacker, bookingId)).toEqual({ error: 'NOT_OWNER' });
      expect((await stored(bookingId)).status).toBe('CONFIRMED');
    });

    it('loses a race against the owner: exactly one cancel succeeds', async () => {
      const { owner, bookingId } = await bookedSeat();
      const attacker = await makeUser();

      const [mine, theirs] = await Promise.all([
        cancel(bookingId, tokenFor(owner)),
        cancel(bookingId, tokenFor(attacker)),
      ]);

      expect(mine.status).toBe(200);
      expect(theirs.status).toBe(403);
      expect((await stored(bookingId)).status).toBe('CANCELLED');
    });
  });

  describe('requests without valid credentials', () => {
    it('get 401 with no token and leave the booking alone', async () => {
      const { bookingId } = await bookedSeat();

      expect(await cancel(bookingId)).toMatchObject({ status: 401, json: { error: 'Not logged in' } });
      expect((await stored(bookingId)).status).toBe('CONFIRMED');
    });

    it('get 401 with a garbage token', async () => {
      const { bookingId } = await bookedSeat();

      expect(await cancel(bookingId, 'not-a-token')).toMatchObject({ status: 401, json: { error: 'Invalid token' } });
      expect((await stored(bookingId)).status).toBe('CONFIRMED');
    });

    it('get 401 with a token forged for the owner using the old hardcoded secret', async () => {
      const { owner, bookingId } = await bookedSeat();
      const forged = jwt.sign({ id: owner, email: 'x@test.local', role: 'ATTENDEE' }, 'seatbook-secret-123');

      expect((await cancel(bookingId, forged)).status).toBe(401);
      expect((await stored(bookingId)).status).toBe('CONFIRMED');
    });
  });

  describe('bad ids', () => {
    it('returns 404 for a booking that does not exist', async () => {
      const user = await makeUser();

      expect(await cancel(2147483647, tokenFor(user))).toMatchObject({
        status: 404,
        json: { error: 'Booking not found' },
      });
    });

    it('returns 400 for a malformed id', async () => {
      const user = await makeUser();

      for (const id of ['abc', '1.5', '-1', '0']) {
        expect(await cancel(id, tokenFor(user))).toMatchObject({ status: 400, json: { error: 'Invalid booking id' } });
      }
    });
  });

  it('does not affect confirming holds', async () => {
    const owner = await makeUser();
    const [seat] = await makeSeats(1);
    const held = await holdSeat(owner, seat);
    if (!('booking' in held)) throw new Error('setup: hold failed');

    expect(await confirmHold(owner, held.booking.id)).toHaveProperty('booking');
    expect((await cancel(held.booking.id, tokenFor(owner))).status).toBe(200);
  });
});
