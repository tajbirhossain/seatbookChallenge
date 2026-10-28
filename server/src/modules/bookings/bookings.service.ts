import prisma from '../../lib/prisma';
import { formatPrice } from '../../utils/helpers';

export type CreateBookingResult =
  | { booking: Awaited<ReturnType<typeof prisma.booking.create>> }
  | { error: 'SEAT_NOT_FOUND' | 'EVENT_STARTED' | 'SEAT_TAKEN' };

export async function createBooking(userId: number, seatId: number): Promise<CreateBookingResult> {
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

  const existing = await prisma.booking.findFirst({
    where: { seatId: seat.id, status: 'CONFIRMED' },
  });

  if (existing) {
    return { error: 'SEAT_TAKEN' };
  }

  const booking = await prisma.booking.create({
    data: {
      seatId: seat.id,
      userId,
      status: 'CONFIRMED',
    },
  });

  return { booking };
}

export async function listUserBookings(userId: number) {
  const bookings = await prisma.booking.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    include: { seat: { include: { event: true } } },
  });

  return bookings.map((b) => ({
    id: b.id,
    status: b.status,
    createdAt: b.createdAt,
    seat: b.seat.label,
    event: {
      id: b.seat.event.id,
      title: b.seat.event.title,
      venue: b.seat.event.venue,
      startsAt: b.seat.event.startsAt,
      price: formatPrice(b.seat.event.priceCents),
    },
  }));
}

export async function cancelBooking(id: number) {
  await prisma.booking.updateMany({
    where: { id, status: 'CONFIRMED' },
    data: { status: 'CANCELLED', cancelledAt: new Date() },
  });
}
