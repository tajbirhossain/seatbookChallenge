-- A seat can have at most one confirmed or held booking at a time.
-- This is what stops concurrent requests from booking the same seat; Prisma
-- cannot express partial indexes in schema.prisma, so it lives only here.
CREATE UNIQUE INDEX "Booking_seatId_active_key" ON "Booking"("seatId") WHERE "status" IN ('CONFIRMED', 'HELD');
