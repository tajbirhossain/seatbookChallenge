import { Prisma } from '@prisma/client';

export const HOLD_DURATION_MS = 10 * 60 * 1000;

// Most seats one user can have on hold at the same time, across all events.
export const MAX_ACTIVE_HOLDS = 2;

// A booking occupies its seat while it is confirmed, or held and not yet expired.
// Expired holds count as free even before the sweeper marks them EXPIRED.
export function activeBookingWhere(now: Date): Prisma.BookingWhereInput {
  return {
    OR: [{ status: 'CONFIRMED' }, { status: 'HELD', expiresAt: { gt: now } }],
  };
}
