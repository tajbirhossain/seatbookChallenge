import prisma from '../../lib/prisma';
import { formatPrice, isSeatBookable, seatLabel } from '../../utils/helpers';

export async function listEvents() {
  const events = await prisma.event.findMany({
    orderBy: { startsAt: 'asc' },
    include: { seats: { include: { bookings: true } } },
  });

  return events.map((event) => {
    const seatsLeft = event.seats.filter((seat) => isSeatBookable(seat, event)).length;
    return {
      id: event.id,
      title: event.title,
      venue: event.venue,
      startsAt: event.startsAt,
      price: formatPrice(event.priceCents),
      totalSeats: event.seats.length,
      seatsLeft,
    };
  });
}

// Returns null when the event does not exist.
export async function getEventWithSeats(id: number) {
  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      organizer: { select: { id: true, name: true } },
      seats: {
        orderBy: [{ row: 'asc' }, { col: 'asc' }],
        include: { bookings: { where: { status: 'CONFIRMED' } } },
      },
    },
  });

  if (!event) {
    return null;
  }

  const seats = event.seats.map((seat) => ({
    id: seat.id,
    row: seat.row,
    col: seat.col,
    label: seat.label,
    available: seat.bookings.length === 0,
  }));

  return {
    id: event.id,
    title: event.title,
    description: event.description,
    venue: event.venue,
    startsAt: event.startsAt,
    price: formatPrice(event.priceCents),
    rows: event.rows,
    cols: event.cols,
    organizer: event.organizer,
    seats,
  };
}

export async function createEvent(
  organizerId: number,
  input: {
    title: string;
    description?: string;
    venue: string;
    startsAt: string;
    rows: number;
    cols: number;
    priceCents?: number;
  }
) {
  const seats = [];
  for (let r = 0; r < input.rows; r++) {
    for (let c = 0; c < input.cols; c++) {
      seats.push({ row: r, col: c, label: seatLabel(r, c) });
    }
  }

  return prisma.event.create({
    data: {
      title: input.title,
      description: input.description || '',
      venue: input.venue,
      startsAt: new Date(input.startsAt),
      rows: input.rows,
      cols: input.cols,
      priceCents: input.priceCents || 0,
      organizerId,
      seats: { create: seats },
    },
  });
}
