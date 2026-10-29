import { Request, Response, NextFunction } from 'express';
import { AppError } from '../lib/errors';
import { verifyToken } from '../lib/jwt';

export interface AuthUser {
  id: number;
  email: string;
  role: 'ORGANIZER' | 'ATTENDEE';
}

export interface AuthRequest extends Request {
  user?: AuthUser;
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header) {
    return next(new AppError(401, 'Not logged in'));
  }

  const token = header.replace('Bearer ', '');
  try {
    req.user = verifyToken(token);
  } catch (err) {
    return next(new AppError(401, 'Invalid token'));
  }
  next();
}
