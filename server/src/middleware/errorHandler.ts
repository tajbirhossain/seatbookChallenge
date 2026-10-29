import { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { AppError } from '../lib/errors';

type HttpError = { status: number; message: string };

// Prisma codes that mean the database is unreachable or overloaded rather than the request being wrong.
const DB_UNAVAILABLE_CODES = new Set(['P1001', 'P1002', 'P1008', 'P1017', 'P2024', 'P2028']);

// Maps any thrown value to a status and a message that is safe to show clients.
// Raw error messages are never forwarded: they can contain SQL, file paths and stack details.
function toHttpError(err: any): HttpError {
  if (err instanceof AppError) {
    return { status: err.status, message: err.message };
  }

  // Errors raised by the body parser (malformed JSON, body too large).
  if (typeof err?.status === 'number' && err.status >= 400 && err.status < 500 && err.expose) {
    if (err.type === 'entity.parse.failed') return { status: 400, message: 'Invalid JSON body' };
    if (err.type === 'entity.too.large') return { status: 413, message: 'Request body too large' };
    return { status: err.status, message: 'Bad request' };
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') return { status: 409, message: 'Resource already exists' };
    if (err.code === 'P2025') return { status: 404, message: 'Not found' };
    if (err.code === 'P2003') return { status: 409, message: 'Operation conflicts with existing data' };
    if (DB_UNAVAILABLE_CODES.has(err.code)) return { status: 503, message: 'Service temporarily unavailable' };
  }

  if (err instanceof Prisma.PrismaClientInitializationError) {
    return { status: 503, message: 'Service temporarily unavailable' };
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    return { status: 400, message: 'Invalid request data' };
  }

  return { status: 500, message: 'Internal server error' };
}

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: 'Not found' });
}

// Must be registered last. Every error response from the API has the shape { error: string }.
export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction) {
  if (res.headersSent) {
    return next(err);
  }

  const { status, message } = toHttpError(err);

  if (status >= 500) {
    console.error(`${req.method} ${req.originalUrl} failed`, err);
  }

  res.status(status).json({ error: message });
}
