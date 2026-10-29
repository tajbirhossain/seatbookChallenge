import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config/env';
import type { AuthUser } from '../middleware/auth';

export function signToken(user: AuthUser): string {
  return jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '7d',
  });
}

// Throws when the token is invalid, expired or signed with a different secret.
export function verifyToken(token: string): AuthUser {
  return jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as AuthUser;
}
