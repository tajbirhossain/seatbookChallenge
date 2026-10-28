import '../src/config/env'; // loads server/.env so DATABASE_URL is set when running outside Docker
import { afterAll, describe, expect, it } from 'vitest';
import prisma from '../src/lib/prisma';
import { confirmHold, createBooking, holdSeat } from '../src/modules/bookings/bookings.service';
import { MAX_ACTIVE_HOLDS } from '../src/modules/bookings/bookings.rules';
import { seatLabel } from '../src/utils/helpers';

// These tests use the real database (not mocks) because the guarantee being tested
// is a database-level one. They create their own users and events and remove them after.
describe.skipIf(!process.env.DATABASE_URL)('seat hold limit', () => {
  const runId = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const userIds: number[] = [];
  const eventIds: number[] = [];
  let counter = 0;

  async function makeUser() {
    const user = await prisma.user.create({
      data: { email: `holdlimit-${runId}-${counter++}@test.local`, name: 'Hold Limit', passwordHash: 'x' },
    });
    userIds.push(user.id);
    return user.id;
  }

  // Returns the ids of `count` fresh seats on a new future event.
  async function makeSeats(count: number) {
    const organizerId = userIds[0] ?? (await makeUser());
    const seats = Array.from({ length: count }, (_, c) => ({ row: 0, col: c, label: seatLabel(0, c) }));
    const event = await prisma.event.create({
      data: {
        title: `Hold limit ${runId}`,
        description: '',
        venue: 'test',
        startsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        rows: 1,
        cols: count,
        priceCents: 0,
        organizerId,
        seats: { create: seats },
      },
      include: { seats: true },
    });
    eventIds.push(event.id);
    return event.seats.map((s) => s.id);
  }

  const activeHolds = (userId: number) =>
    prisma.booking.count({ where: { userId, status: 'HELD', expiresAt: { gt: new Date() } } });

  afterAll(async () => {
    await prisma.booking.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.event.deleteMany({ where: { id: { in: eventIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  it('allows up to the limit and rejects the next hold', async () => {
    const user = await makeUser();
    const seats = await makeSeats(MAX_ACTIVE_HOLDS + 1);

    for (const seatId of seats.slice(0, MAX_ACTIVE_HOLDS)) {
      expect(await holdSeat(user, seatId)).toHaveProperty('booking');
    }

    expect(await holdSeat(user, seats[MAX_ACTIVE_HOLDS])).toEqual({ error: 'HOLD_LIMIT_REACHED' });
    expect(await activeHolds(user)).toBe(MAX_ACTIVE_HOLDS);
  });

  it('never exceeds the limit when one user sends many holds at once', async () => {
    const user = await makeUser();
    const seats = await makeSeats(10);

    const results = await Promise.all(seats.map((seatId) => holdSeat(user, seatId)));

    expect(results.filter((r) => 'booking' in r)).toHaveLength(MAX_ACTIVE_HOLDS);
    expect(results.filter((r) => 'error' in r && r.error === 'HOLD_LIMIT_REACHED')).toHaveLength(
      results.length - MAX_ACTIVE_HOLDS
    );
    expect(await activeHolds(user)).toBe(MAX_ACTIVE_HOLDS);
  });

  it('keeps the limit across repeated bursts', async () => {
    const user = await makeUser();
    const seats = await makeSeats(12);

    for (let burst = 0; burst < 3; burst++) {
      await Promise.all(seats.slice(burst * 4, burst * 4 + 4).map((seatId) => holdSeat(user, seatId)));
    }

    expect(await activeHolds(user)).toBe(MAX_ACTIVE_HOLDS);
  });

  it('applies the limit per user, not globally', async () => {
    const first = await makeUser();
    const second = await makeUser();
    const seats = await makeSeats(MAX_ACTIVE_HOLDS * 2);

    const results = await Promise.all([
      ...seats.slice(0, MAX_ACTIVE_HOLDS).map((seatId) => holdSeat(first, seatId)),
      ...seats.slice(MAX_ACTIVE_HOLDS).map((seatId) => holdSeat(second, seatId)),
    ]);

    expect(results.every((r) => 'booking' in r)).toBe(true);
  });

  it('counts holds across events', async () => {
    const user = await makeUser();
    const [a, b] = [await makeSeats(2), await makeSeats(2)];

    expect(await holdSeat(user, a[0])).toHaveProperty('booking');
    expect(await holdSeat(user, b[0])).toHaveProperty('booking');
    expect(await holdSeat(user, a[1])).toEqual({ error: 'HOLD_LIMIT_REACHED' });
  });

  it('does not count an expired hold', async () => {
    const user = await makeUser();
    const seats = await makeSeats(3);

    await holdSeat(user, seats[0]);
    await holdSeat(user, seats[1]);
    await prisma.booking.updateMany({
      where: { userId: user, seatId: seats[0] },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    expect(await holdSeat(user, seats[2])).toHaveProperty('booking');
  });

  it('does not count confirmed holds or direct bookings', async () => {
    const user = await makeUser();
    const seats = await makeSeats(5);

    const held = await holdSeat(user, seats[0]);
    expect(held).toHaveProperty('booking');
    if ('booking' in held) {
      expect(await confirmHold(user, held.booking.id)).toHaveProperty('booking');
    }
    expect(await createBooking(user, seats[1])).toHaveProperty('booking');
    expect(await createBooking(user, seats[2])).toHaveProperty('booking');

    expect(await holdSeat(user, seats[3])).toHaveProperty('booking');
    expect(await holdSeat(user, seats[4])).toHaveProperty('booking');
  });

  it('lets a user at the limit re-hold a seat they already hold', async () => {
    const user = await makeUser();
    const seats = await makeSeats(MAX_ACTIVE_HOLDS);

    const holds = await Promise.all(seats.map((seatId) => holdSeat(user, seatId)));
    const again = await holdSeat(user, seats[0]);

    expect(holds.every((r) => 'booking' in r)).toBe(true);
    expect(again).toHaveProperty('booking');
    expect(await activeHolds(user)).toBe(MAX_ACTIVE_HOLDS);
  });

  it('lets a user at the limit book directly, and confirm their own hold', async () => {
    const user = await makeUser();
    const seats = await makeSeats(MAX_ACTIVE_HOLDS + 2);

    for (const seatId of seats.slice(0, MAX_ACTIVE_HOLDS)) {
      await holdSeat(user, seatId);
    }

    expect(await createBooking(user, seats[MAX_ACTIVE_HOLDS])).toHaveProperty('booking');
    // direct booking of a seat the user already holds confirms that hold
    expect(await createBooking(user, seats[0])).toHaveProperty('booking');
    expect(await activeHolds(user)).toBe(MAX_ACTIVE_HOLDS - 1);
  });

  it('frees a slot once a hold is confirmed', async () => {
    const user = await makeUser();
    const seats = await makeSeats(MAX_ACTIVE_HOLDS + 1);

    const holds = await Promise.all(seats.slice(0, MAX_ACTIVE_HOLDS).map((seatId) => holdSeat(user, seatId)));
    expect(await holdSeat(user, seats[MAX_ACTIVE_HOLDS])).toEqual({ error: 'HOLD_LIMIT_REACHED' });

    const first = holds[0];
    if ('booking' in first) {
      await confirmHold(user, first.booking.id);
    }

    expect(await holdSeat(user, seats[MAX_ACTIVE_HOLDS])).toHaveProperty('booking');
  });
});
