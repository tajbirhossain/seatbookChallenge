import { Prisma } from '@prisma/client';
import prisma from '../../lib/prisma';
import { formatPrice } from '../../utils/helpers';
import { HOLD_DURATION_MS, MAX_ACTIVE_HOLDS } from './bookings.rules';

type Booking = Awaited<ReturnType<typeof prisma.booking.create>>;

export type ReserveSeatResult =
  | { booking: Booking }
  | { error: 'SEAT_NOT_FOUND' | 'EVENT_STARTED' | 'SEAT_TAKEN' | 'SEAT_HELD' | 'HOLD_LIMIT_REACHED' | 'SEAT_HOLD_EXPIRED' };

export type ConfirmHoldResult =
  | { booking: Booking }
  | { error: 'HOLD_NOT_FOUND' | 'HOLD_EXPIRED' | 'NOT_HELD' };

// Books the seat straight away.
export function createBooking(userId: number, seatId: number) {
  return reserveSeat(userId, seatId, 'CONFIRMED');
}

// Holds the seat for HOLD_DURATION_MS; confirmHold turns the hold into a booking.
export function holdSeat(userId: number, seatId: number) {
  return reserveSeat(userId, seatId, 'HELD');
}

async function reserveSeat(userId: number, seatId: number, status: 'CONFIRMED' | 'HELD'): Promise<ReserveSeatResult> {
  const seat = await prisma.seat.findUnique({
    where: { id: seatId },
    include: { event: true },
  });

  if (!seat) {
    return { error: 'SEAT_NOT_FOUND' };
  }

  if (seat.event.startsAt < new Date()) {
    return { error: 'EVENT_STARTED' };
  }

  try {
    return await prisma.$transaction(async (tx): Promise<ReserveSeatResult> => {
      if (status === 'HELD') {
        // Take the user's row lock so their concurrent hold requests run one at a time;
        // otherwise each could count fewer than MAX_ACTIVE_HOLDS holds and all insert.
        await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
      }

      const now = new Date();

      // Free the seat if an earlier hold on it has run out.
      await tx.booking.updateMany({
        where: { seatId: seat.id, status: 'HELD', expiresAt: { lte: now } },
        data: { status: 'EXPIRED' },
      });

      const current = await tx.booking.findFirst({
        where: { seatId: seat.id, status: { in: ['CONFIRMED', 'HELD'] } },
      });

      if (current) {
        if (current.status === 'HELD' && current.userId === userId) {
          // The user already holds this seat: reuse the hold, or confirm it when booking directly.
          if (status === 'CONFIRMED') {
            const booking = await tx.booking.update({
              where: { id: current.id },
              data: { status: 'CONFIRMED', expiresAt: null },
            });
            return { booking };
          }
          return { booking: current };
        }
        return { error: current.status === 'HELD' ? 'SEAT_HELD' : 'SEAT_TAKEN' };
      }

      // A user whose own hold on this seat ran out cannot take the seat again. Holds that
      // lapsed but were not swept yet were marked EXPIRED above, so they count too.
      const lapsedHold = await tx.booking.findFirst({
        where: { seatId: seat.id, userId, status: 'EXPIRED' },
      });
      if (lapsedHold) {
        return { error: 'SEAT_HOLD_EXPIRED' };
      }

      if (status === 'HELD') {
        const activeHolds = await tx.booking.count({
          where: { userId, status: 'HELD', expiresAt: { gt: now } },
        });
        if (activeHolds >= MAX_ACTIVE_HOLDS) {
          return { error: 'HOLD_LIMIT_REACHED' };
        }
      }

      const booking = await tx.booking.create({
        data: {
          seatId: seat.id,
          userId,
          status,
          expiresAt: status === 'HELD' ? new Date(now.getTime() + HOLD_DURATION_MS) : null,
        },
      });
      return { booking };
    });
  } catch (err) {
    // Two requests raced for the same seat: the partial unique index let only one through.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return { error: 'SEAT_TAKEN' };
    }
    throw err;
  }
}

export async function confirmHold(userId: number, bookingId: number): Promise<ConfirmHoldResult> {
  // One atomic update: only the owner's unexpired hold can be confirmed.
  const confirmed = await prisma.booking.updateMany({
    where: { id: bookingId, userId, status: 'HELD', expiresAt: { gt: new Date() } },
    data: { status: 'CONFIRMED', expiresAt: null },
  });

  const booking = await prisma.booking.findFirst({ where: { id: bookingId, userId } });

  if (!booking) {
    return { error: 'HOLD_NOT_FOUND' };
  }
  if (confirmed.count === 1) {
    return { booking };
  }
  if (booking.status === 'HELD' || booking.status === 'EXPIRED') {
    return { error: 'HOLD_EXPIRED' };
  }
  return { error: 'NOT_HELD' };
}

// Marks holds that have run out as EXPIRED. Availability does not depend on this
// running (see activeBookingWhere); it keeps the stored status accurate.
export async function releaseExpiredHolds() {
  const released = await prisma.booking.updateMany({
    where: { status: 'HELD', expiresAt: { lte: new Date() } },
    data: { status: 'EXPIRED' },
  });
  return released.count;
}

type BookingWithEvent = Prisma.BookingGetPayload<{ include: { seat: { include: { event: true } } } }>;

function toBookingView(b: BookingWithEvent) {
  return {
    id: b.id,
    status: b.status,
    createdAt: b.createdAt,
    expiresAt: b.expiresAt,
    seat: b.seat.label,
    event: {
      id: b.seat.event.id,
      title: b.seat.event.title,
      venue: b.seat.event.venue,
      startsAt: b.seat.event.startsAt,
      price: formatPrice(b.seat.event.priceCents),
    },
  };
}

// Confirmed and cancelled bookings; holds are listed by listUserHolds.
export async function listUserBookings(userId: number) {
  const bookings = await prisma.booking.findMany({
    where: { userId, status: { in: ['CONFIRMED', 'CANCELLED'] } },
    orderBy: { createdAt: 'desc' },
    include: { seat: { include: { event: true } } },
  });

  return bookings.map(toBookingView);
}

export async function listUserHolds(userId: number) {
  const holds = await prisma.booking.findMany({
    where: { userId, status: 'HELD', expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
    include: { seat: { include: { event: true } } },
  });

  return holds.map(toBookingView);
}

// Seats the user can no longer take because their own hold on them ran out
// (see the lapsed-hold check in reserveSeat). Optionally limited to one event.
export async function listBlockedSeats(userId: number, eventId?: number) {
  const lapsed = await prisma.booking.findMany({
    where: {
      userId,
      OR: [{ status: 'EXPIRED' }, { status: 'HELD', expiresAt: { lte: new Date() } }],
      ...(eventId !== undefined ? { seat: { eventId } } : {}),
    },
    distinct: ['seatId'],
    include: { seat: true },
  });

  return lapsed.map((b) => ({ seatId: b.seatId, label: b.seat.label, eventId: b.seat.eventId }));
}

export async function cancelBooking(id: number) {
  await prisma.booking.updateMany({
    where: { id, status: 'CONFIRMED' },
    data: { status: 'CANCELLED', cancelledAt: new Date() },
  });
}
