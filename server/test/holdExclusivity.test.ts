import '../src/config/env'; // loads server/.env so DATABASE_URL is set when running outside Docker
import { afterAll, describe, expect, it } from 'vitest';
import prisma from '../src/lib/prisma';
import { confirmHold, createBooking, holdSeat } from '../src/modules/bookings/bookings.service';
import { createFixtures } from './support/fixtures';

describe.skipIf(!process.env.DATABASE_URL)('seat held by another user', () => {
  const { makeUser, makeSeats, cleanup } = createFixtures('holdexclusive');

  const activeRows = (seatId: number) =>
    prisma.booking.findMany({ where: { seatId, status: { in: ['CONFIRMED', 'HELD'] } } });

  afterAll(cleanup);

  it('another user cannot book a seat that is on hold', async () => {
    const holder = await makeUser();
    const other = await makeUser();
    const [seat] = await makeSeats(1);

    await holdSeat(holder, seat);

    expect(await createBooking(other, seat)).toEqual({ error: 'SEAT_HELD' });

    const rows = await activeRows(seat);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId: holder, status: 'HELD' });
  });

  it('another user cannot hold a seat that is on hold', async () => {
    const holder = await makeUser();
    const other = await makeUser();
    const [seat] = await makeSeats(1);

    await holdSeat(holder, seat);

    expect(await holdSeat(other, seat)).toEqual({ error: 'SEAT_HELD' });
  });

  it('the holder can still confirm after others were rejected', async () => {
    const holder = await makeUser();
    const other = await makeUser();
    const [seat] = await makeSeats(1);

    const held = await holdSeat(holder, seat);
    await createBooking(other, seat);
    await holdSeat(other, seat);

    expect(held).toHaveProperty('booking');
    if ('booking' in held) {
      expect(await confirmHold(holder, held.booking.id)).toHaveProperty('booking');
    }
    expect(await activeRows(seat)).toMatchObject([{ userId: holder, status: 'CONFIRMED' }]);
  });

  it('many users trying to book a held seat at once all fail', async () => {
    const holder = await makeUser();
    const others = await Promise.all(Array.from({ length: 10 }, () => makeUser()));
    const [seat] = await makeSeats(1);

    await holdSeat(holder, seat);
    const results = await Promise.all(others.map((user) => createBooking(user, seat)));

    expect(results.every((r) => 'error' in r)).toBe(true);
    expect(await activeRows(seat)).toMatchObject([{ userId: holder, status: 'HELD' }]);
  });

  it('a hold racing against a direct booking leaves exactly one winner', async () => {
    const holder = await makeUser();
    const buyer = await makeUser();
    const [seat] = await makeSeats(1);

    const results = await Promise.all([holdSeat(holder, seat), createBooking(buyer, seat)]);

    expect(results.filter((r) => 'booking' in r)).toHaveLength(1);
    expect(await activeRows(seat)).toHaveLength(1);
  });

  it('another user can book the seat once the hold has expired', async () => {
    const holder = await makeUser();
    const other = await makeUser();
    const [seat] = await makeSeats(1);

    await holdSeat(holder, seat);
    await prisma.booking.updateMany({
      where: { seatId: seat, status: 'HELD' },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    expect(await createBooking(other, seat)).toHaveProperty('booking');
  });
});
