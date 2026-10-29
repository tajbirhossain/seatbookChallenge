import { Request, Response } from 'express';
import { AppError } from '../../lib/errors';
import { AuthRequest } from '../../middleware/auth';
import { toPositiveInt } from '../../utils/helpers';
import * as eventService from './events.service';
import { validateCreateEvent } from './events.validation';

export async function list(req: Request, res: Response) {
  const events = await eventService.listEvents();
  res.json(events);
}

export async function getById(req: Request, res: Response) {
  const id = toPositiveInt(req.params.id);
  if (id === null) {
    throw new AppError(400, 'Invalid event id');
  }

  const event = await eventService.getEventWithSeats(id);
  if (!event) {
    throw new AppError(404, 'Event not found');
  }

  res.json(event);
}

export async function create(req: AuthRequest, res: Response) {
  if (req.user!.role !== 'ORGANIZER') {
    throw new AppError(403, 'Only organizers can create events');
  }

  const invalid = validateCreateEvent(req.body);
  if (invalid) {
    throw new AppError(400, invalid);
  }

  const event = await eventService.createEvent(req.user!.id, req.body);

  res.status(201).json(event);
}
