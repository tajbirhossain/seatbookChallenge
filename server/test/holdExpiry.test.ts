import '../src/config/env'; // loads server/.env so DATABASE_URL is set when running outside Docker
import { afterAll, describe, expect, it } from 'vitest';
import prisma from '../src/lib/prisma';
import {
  cancelBooking,
  confirmHold,
  createBooking,
  holdSeat,
  listBlockedSeats,
  releaseExpiredHolds,
} from '../src/modules/bookings/bookings.service';
import { backdateHold, createFixtures } from './support/fixtures';

const lapsed = { error: 'SEAT_HOLD_EXPIRED' };

describe.skipIf(!process.env.DATABASE_URL)('seat unavailable after your own hold expires', () => {
  const { makeUser, makeSeats, cleanup } = createFixtures('holdexpiry');

  afterAll(cleanup);

  it('blocks holding the seat again once the hold has lapsed', async () => {
    const user = await makeUser();
    const [seat] = await makeSeats(1);

    await holdSeat(user, seat);
    await backdateHold(user, seat);

    expect(await holdSeat(user, seat)).toEqual(lapsed);
  });

  it('blocks booking the seat directly once the hold has lapsed', async () => {
    const user = await makeUser();
    const [seat] = await makeSeats(1);

    await holdSeat(user, seat);
    await backdateHold(user, seat);

    expect(await createBooking(user, seat)).toEqual(lapsed);
    expect(await prisma.booking.count({ where: { seatId: seat, status: { in: ['CONFIRMED', 'HELD'] } } })).toBe(0);
  });

  it('keeps blocking after the sweeper has marked the hold EXPIRED', async () => {
    const user = await makeUser();
    const [seat] = await makeSeats(1);

    await holdSeat(user, seat);
    await backdateHold(user, seat);
    await releaseExpiredHolds();

    expect(await prisma.booking.count({ where: { userId: user, seatId: seat, status: 'EXPIRED' } })).toBe(1);
    expect(await holdSeat(user, seat)).toEqual(lapsed);
    expect(await createBooking(user, seat)).toEqual(lapsed);
  });

  it('does not let the lapsed hold be confirmed', async () => {
    const user = await makeUser();
    const [seat] = await makeSeats(1);

    const held = await holdSeat(user, seat);
    await backdateHold(user, seat);

    expect(held).toHaveProperty('booking');
    if ('booking' in held) {
      expect(await confirmHold(user, held.booking.id)).toEqual({ error: 'HOLD_EXPIRED' });
    }
  });

  it('frees the seat for other users', async () => {
    const holder = await makeUser();
    const other = await makeUser();
    const [seat, seat2] = await makeSeats(2);

    await holdSeat(holder, seat);
    await holdSeat(holder, seat2);
    await backdateHold(holder, seat);
    await backdateHold(holder, seat2);

    expect(await holdSeat(other, seat)).toHaveProperty('booking');
    expect(await createBooking(other, seat2)).toHaveProperty('booking');
  });

  it('only blocks the seat that expired, not the user', async () => {
    const user = await makeUser();
    const [expired, fresh, other] = await makeSeats(3);

    await holdSeat(user, expired);
    await backdateHold(user, expired);

    expect(await holdSeat(user, expired)).toEqual(lapsed);
    expect(await holdSeat(user, fresh)).toHaveProperty('booking');
    expect(await createBooking(user, other)).toHaveProperty('booking');
  });

  it('does not block a seat whose hold was confirmed in time and later cancelled', async () => {
    const user = await makeUser();
    const [seat] = await makeSeats(1);

    const held = await holdSeat(user, seat);
    if ('booking' in held) {
      await confirmHold(user, held.booking.id);
      await cancelBooking(held.booking.id);
    }

    expect(await createBooking(user, seat)).toHaveProperty('booking');
  });

  it('still lets a user hold or book a seat they never held', async () => {
    const user = await makeUser();
    const [a, b] = await makeSeats(2);

    expect(await holdSeat(user, a)).toHaveProperty('booking');
    expect(await createBooking(user, b)).toHaveProperty('booking');
  });

  it('lists the seats blocked for the user, per event, and nobody else', async () => {
    const user = await makeUser();
    const other = await makeUser();
    const [lapsedSeat, sweptSeat, activeSeat] = await makeSeats(3);
    const [elsewhere] = await makeSeats(1);

    // Holds are taken one after another because a user can hold only two seats at a time.
    await holdSeat(user, sweptSeat);
    await backdateHold(user, sweptSeat);
    await releaseExpiredHolds(); // sweptSeat is now EXPIRED

    await holdSeat(user, lapsedSeat);
    await backdateHold(user, lapsedSeat); // lapsed but not swept yet

    await holdSeat(user, activeSeat); // still active, so not blocked
    await holdSeat(user, elsewhere);
    await backdateHold(user, elsewhere);

    const { eventId } = await prisma.seat.findUniqueOrThrow({ where: { id: lapsedSeat } });
    const blockedIds = (await listBlockedSeats(user)).map((b) => b.seatId).sort();

    expect(blockedIds).toEqual([lapsedSeat, sweptSeat, elsewhere].sort());
    expect(blockedIds).not.toContain(activeSeat);
    expect(await listBlockedSeats(user, eventId)).toHaveLength(2);
    expect(await listBlockedSeats(other)).toEqual([]);
  });

  it('keeps other users out while the hold is active, and the holder can still confirm', async () => {
    const holder = await makeUser();
    const other = await makeUser();
    const [seat] = await makeSeats(1);

    const held = await holdSeat(holder, seat);

    expect(await holdSeat(other, seat)).toEqual({ error: 'SEAT_HELD' });
    expect(held).toHaveProperty('booking');
    if ('booking' in held) {
      expect(await confirmHold(holder, held.booking.id)).toHaveProperty('booking');
    }
  });
});
