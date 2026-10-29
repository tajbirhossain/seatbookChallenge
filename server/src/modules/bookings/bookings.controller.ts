import { Response } from 'express';
import { AppError } from '../../lib/errors';
import { AuthRequest } from '../../middleware/auth';
import { toPositiveInt } from '../../utils/helpers';
import * as bookingService from './bookings.service';
import type { ReserveSeatResult } from './bookings.service';
import { MAX_ACTIVE_HOLDS } from './bookings.rules';

function parseSeatId(body: any): number {
  const seatId = toPositiveInt(body?.seatId);
  if (seatId === null) {
    throw new AppError(400, 'seatId must be a positive integer');
  }
  return seatId;
}

function parseBookingId(req: AuthRequest): number {
  const id = toPositiveInt(req.params.id);
  if (id === null) {
    throw new AppError(400, 'Invalid booking id');
  }
  return id;
}

function sendReserveResult(res: Response, result: ReserveSeatResult) {
  if (!('error' in result)) {
    return res.status(201).json(result.booking);
  }

  switch (result.error) {
    case 'SEAT_NOT_FOUND':
      throw new AppError(404, 'Seat not found');
    case 'EVENT_STARTED':
      throw new AppError(400, 'This event has already started');
    case 'SEAT_TAKEN':
      throw new AppError(409, 'Seat already booked');
    case 'SEAT_HELD':
      throw new AppError(409, 'Seat is currently on hold');
    case 'SEAT_HOLD_EXPIRED':
      throw new AppError(403, 'Your hold on this seat expired, so it is no longer available to you');
    case 'HOLD_LIMIT_REACHED':
      throw new AppError(409, `You can hold at most ${MAX_ACTIVE_HOLDS} seats at a time`);
  }
}

export async function create(req: AuthRequest, res: Response) {
  const result = await bookingService.createBooking(req.user!.id, parseSeatId(req.body));

  sendReserveResult(res, result);
}

export async function hold(req: AuthRequest, res: Response) {
  const result = await bookingService.holdSeat(req.user!.id, parseSeatId(req.body));

  sendReserveResult(res, result);
}

export async function confirm(req: AuthRequest, res: Response) {
  const result = await bookingService.confirmHold(req.user!.id, parseBookingId(req));

  if ('error' in result) {
    switch (result.error) {
      case 'HOLD_NOT_FOUND':
        throw new AppError(404, 'Booking not found');
      case 'HOLD_EXPIRED':
        throw new AppError(410, 'Hold has expired');
      case 'NOT_HELD':
        throw new AppError(409, 'Booking is not on hold');
    }
  }

  res.json(result.booking);
}

export async function listMine(req: AuthRequest, res: Response) {
  res.json(await bookingService.listUserBookings(req.user!.id));
}

export async function listHolds(req: AuthRequest, res: Response) {
  res.json(await bookingService.listUserHolds(req.user!.id));
}

export async function listBlockedSeats(req: AuthRequest, res: Response) {
  let eventId: number | undefined;
  if (req.query.eventId !== undefined) {
    const parsed = toPositiveInt(req.query.eventId);
    if (parsed === null) {
      throw new AppError(400, 'eventId must be a positive integer');
    }
    eventId = parsed;
  }

  res.json(await bookingService.listBlockedSeats(req.user!.id, eventId));
}

export async function cancel(req: AuthRequest, res: Response) {
  await bookingService.cancelBooking(parseBookingId(req));

  res.json({ success: true });
}
