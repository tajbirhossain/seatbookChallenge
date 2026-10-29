import { Booking, Event, Seat } from '@prisma/client';

export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function seatLabel(row: number, col: number): string {
  return `${String.fromCharCode(65 + row)}${col + 1}`;
}

export function isSeatBookable(seat: Seat & { bookings: Booking[] }, event: Event): boolean {
  if (new Date(event.startsAt) < new Date()) {
    return false;
  }
  return seat.bookings.length === 0;
}

// Strictly parses a positive 32-bit integer id from a number or a digits-only string.
// Returns null for anything else (NaN, floats, booleans, arrays, "12abc", out of range).
export function toPositiveInt(value: unknown): number | null {
  let n: number;
  if (typeof value === 'number') {
    n = value;
  } else if (typeof value === 'string' && /^\d+$/.test(value)) {
    n = Number(value);
  } else {
    return null;
  }

  return Number.isInteger(n) && n > 0 && n <= 2147483647 ? n : null;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
