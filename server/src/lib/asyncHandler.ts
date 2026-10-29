import { NextFunction, Request, RequestHandler, Response } from 'express';

// Express 4 does not catch rejected promises from async handlers; without this a thrown
// error becomes an unhandled rejection that kills the process. This hands it to next().
export function asyncHandler<Req extends Request = Request>(
  handler: (req: Req, res: Response, next: NextFunction) => unknown
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(handler(req as Req, res, next)).catch(next);
  };
}
