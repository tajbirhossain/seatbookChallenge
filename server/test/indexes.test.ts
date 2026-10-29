import '../src/config/env'; // loads server/.env so DATABASE_URL is set when running outside Docker
import { afterAll, describe, expect, it } from 'vitest';
import prisma from '../src/lib/prisma';

// Indexes only exist through migrations, so nothing else would notice one going missing
// (for example after a reset from schema.prisma alone, which cannot recreate the partial one).
describe.skipIf(!process.env.DATABASE_URL)('Booking indexes', () => {
  afterAll(() => prisma.$disconnect());

  async function bookingIndexes() {
    const rows = await prisma.$queryRaw<{ indexname: string; indexdef: string }[]>`
      SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'Booking'`;
    return new Map(rows.map((r) => [r.indexname, r.indexdef]));
  }

  it('indexes bookings by user and status, for the per-user lists and the hold limit check', async () => {
    const indexes = await bookingIndexes();

    expect(indexes.get('Booking_userId_status_idx')).toMatch(/\("userId", status\)/);
  });

  it('indexes held bookings by expiry, for the sweeper', async () => {
    const indexes = await bookingIndexes();

    expect(indexes.get('Booking_status_expiresAt_idx')).toMatch(/\(status, "expiresAt"\)/);
  });

  it('keeps the partial unique index that stops two active bookings on one seat', async () => {
    const definition = (await bookingIndexes()).get('Booking_seatId_active_key') ?? '';

    expect(definition).toMatch(/CREATE UNIQUE INDEX/);
    expect(definition).toMatch(/\("seatId"\)/);
    expect(definition).toMatch(/CONFIRMED/);
    expect(definition).toMatch(/HELD/);
    expect(definition).not.toMatch(/EXPIRED|CANCELLED/);
  });
});
