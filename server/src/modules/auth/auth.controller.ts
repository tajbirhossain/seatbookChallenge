import { Request, Response } from 'express';
import { AppError } from '../../lib/errors';
import * as authService from './auth.service';
import { validateLogin, validateRegister } from './auth.validation';

export async function register(req: Request, res: Response) {
  const input = validateRegister(req.body);
  if ('error' in input) {
    throw new AppError(400, input.error);
  }

  const result = await authService.register(input.data);

  res.status(201).json(result);
}

export async function login(req: Request, res: Response) {
  const input = validateLogin(req.body);
  if ('error' in input) {
    throw new AppError(400, input.error);
  }

  const result = await authService.login(input.data.email, input.data.password);
  if (!result) {
    throw new AppError(401, 'Invalid credentials');
  }

  res.json(result);
}
