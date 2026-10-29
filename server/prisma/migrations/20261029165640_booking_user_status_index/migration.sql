-- CreateIndex
-- Speeds up everything that looks up one user's bookings or holds: GET /bookings/mine, /holds and
-- /blocked-seats, plus the active-hold count and the lapsed-hold check that run on every hold and
-- booking. Measured at 130k bookings: /mine 8 ms -> 0.13 ms, per-booking checks ~1 ms -> ~0.04 ms.
-- Booking.seatId deliberately has no plain index: seat lookups use the partial unique index on
-- active bookings, and a plain one would only speed up deleting seats or events.
CREATE INDEX "Booking_userId_status_idx" ON "Booking"("userId", "status");
