import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import * as bookingService from './bookings.service';
import type { ReserveSeatResult } from './bookings.service';
import { MAX_ACTIVE_HOLDS } from './bookings.rules';

function sendReserveResult(res: Response, result: ReserveSeatResult) {
  if (!('error' in result)) {
    return res.status(201).json(result.booking);
  }

  switch (result.error) {
    case 'SEAT_NOT_FOUND':
      res.status(404).json({ error: 'Seat not found' });
      break;
    case 'EVENT_STARTED':
      res.status(400).json({ msg: 'This event has already started' });
      break;
    case 'SEAT_TAKEN':
      res.status(409).json({ error: 'Seat already booked' });
      break;
    case 'SEAT_HELD':
      res.status(409).json({ error: 'Seat is currently on hold' });
      break;
    case 'HOLD_LIMIT_REACHED':
      res.status(409).json({ error: `You can hold at most ${MAX_ACTIVE_HOLDS} seats at a time` });
      break;
  }
}

export async function create(req: AuthRequest, res: Response) {
  try {
    const result = await bookingService.createBooking(req.user!.id, Number(req.body.seatId));

    sendReserveResult(res, result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function hold(req: AuthRequest, res: Response) {
  try {
    const result = await bookingService.holdSeat(req.user!.id, Number(req.body.seatId));

    sendReserveResult(res, result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function confirm(req: AuthRequest, res: Response) {
  try {
    const id = parseInt(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    const result = await bookingService.confirmHold(req.user!.id, id);

    if ('error' in result) {
      switch (result.error) {
        case 'HOLD_NOT_FOUND':
          return res.status(404).json({ error: 'Booking not found' });
        case 'HOLD_EXPIRED':
          return res.status(410).json({ error: 'Hold has expired' });
        case 'NOT_HELD':
          return res.status(409).json({ error: 'Booking is not on hold' });
      }
    }

    res.json(result.booking);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function listMine(req: AuthRequest, res: Response) {
  try {
    res.json(await bookingService.listUserBookings(req.user!.id));
  } catch (err) {
    console.log(err);
    res.json([]);
  }
}

export async function listHolds(req: AuthRequest, res: Response) {
  try {
    res.json(await bookingService.listUserHolds(req.user!.id));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function cancel(req: AuthRequest, res: Response) {
  await bookingService.cancelBooking(parseInt(req.params.id));

  res.json({ success: true });
}
