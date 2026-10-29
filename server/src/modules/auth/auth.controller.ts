import { Request, Response } from 'express';
import { AppError } from '../../lib/errors';
import * as authService from './auth.service';
import { validateLogin, validateRegister } from './auth.validation';

export async function register(req: Request, res: Response) {
  const invalid = validateRegister(req.body);
  if (invalid) {
    throw new AppError(400, invalid);
  }

  const { email, password, name } = req.body;
  const result = await authService.register({ email, password, name });

  res.status(201).json(result);
}

export async function login(req: Request, res: Response) {
  const invalid = validateLogin(req.body);
  if (invalid) {
    throw new AppError(400, invalid);
  }

  const result = await authService.login(req.body.email, req.body.password);
  if (!result) {
    throw new AppError(401, 'Invalid credentials');
  }

  res.json(result);
}
