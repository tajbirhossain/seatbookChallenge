import prisma from '../../src/lib/prisma';
import { seatLabel } from '../../src/utils/helpers';

// Creates throwaway users and events in the real database and removes them in cleanup().
export function createFixtures(prefix: string) {
  const runId = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const userIds: number[] = [];
  const eventIds: number[] = [];
  let counter = 0;

  async function makeUser() {
    const user = await prisma.user.create({
      data: { email: `${prefix}-${runId}-${counter++}@test.local`, name: prefix, passwordHash: 'x' },
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
        title: `${prefix} ${runId}`,
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

  async function cleanup() {
    await prisma.booking.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.event.deleteMany({ where: { id: { in: eventIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  }

  return { makeUser, makeSeats, cleanup };
}

// Makes a user's hold on a seat look like its 10 minutes ran out, without waiting.
export function backdateHold(userId: number, seatId: number) {
  return prisma.booking.updateMany({
    where: { userId, seatId, status: 'HELD' },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
}
