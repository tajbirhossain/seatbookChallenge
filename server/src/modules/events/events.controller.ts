import { Request, Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import * as eventService from './events.service';
import { validateCreateEvent } from './events.validation';

export async function list(req: Request, res: Response) {
  const events = await eventService.listEvents();
  res.json(events);
}

export async function getById(req: Request, res: Response) {
  const event = await eventService.getEventWithSeats(parseInt(req.params.id));

  if (!event) {
    return res.json({ success: false, message: 'Event not found' });
  }

  res.json(event);
}

export async function create(req: AuthRequest, res: Response) {
  if (req.user!.role !== 'ORGANIZER') {
    return res.status(403).json({ error: 'Only organizers can create events' });
  }

  try {
    const invalid = validateCreateEvent(req.body);
    if (invalid) {
      return res.status(invalid.status).json(invalid.body);
    }

    const event = await eventService.createEvent(req.user!.id, req.body);

    res.status(201).json(event);
  } catch (err) {
    console.log(err);
    res.status(500).send('Something went wrong');
  }
}
