import { Request, Response } from 'express';
import * as authService from './auth.service';
import { validateRegister } from './auth.validation';

export async function register(req: Request, res: Response) {
  try {
    const invalid = validateRegister(req.body);
    if (invalid) {
      return res.status(400).json({ error: invalid });
    }

    const { email, password, name, role } = req.body;
    const result = await authService.register({ email, password, name, role });

    res.status(201).json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}

export async function login(req: Request, res: Response) {
  const { email, password } = req.body;

  const result = await authService.login(email, password);
  if (!result) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  res.json(result);
}
