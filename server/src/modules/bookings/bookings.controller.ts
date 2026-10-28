import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import * as bookingService from './bookings.service';

export async function create(req: AuthRequest, res: Response) {
  try {
    const result = await bookingService.createBooking(req.user!.id, Number(req.body.seatId));

    if ('error' in result) {
      switch (result.error) {
        case 'SEAT_NOT_FOUND':
          return res.status(404).json({ error: 'Seat not found' });
        case 'EVENT_STARTED':
          return res.status(400).json({ msg: 'This event has already started' });
        case 'SEAT_TAKEN':
          return res.status(409).json({ error: 'Seat already booked' });
      }
    }

    res.status(201).json(result.booking);
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

export async function cancel(req: AuthRequest, res: Response) {
  await bookingService.cancelBooking(parseInt(req.params.id));

  res.json({ success: true });
}
