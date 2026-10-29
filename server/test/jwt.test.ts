import jwt from 'jsonwebtoken';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { NextFunction, Response } from 'express';
import type { AuthRequest } from '../src/middleware/auth';

const SECRET = 'test-secret-for-jwt-tests';
const user = { id: 7, email: 'jwt@test.local', role: 'ORGANIZER' as const };

let signToken: typeof import('../src/lib/jwt.js').signToken;
let verifyToken: typeof import('../src/lib/jwt.js').verifyToken;
let requireAuth: typeof import('../src/middleware/auth.js').requireAuth;

// JWT_SECRET is read when config/env is first imported, so set it before importing.
beforeAll(async () => {
  vi.stubEnv('JWT_SECRET', SECRET);
  vi.resetModules();
  ({ signToken, verifyToken } = await import('../src/lib/jwt.js'));
  ({ requireAuth } = await import('../src/middleware/auth.js'));
});

function runRequireAuth(authorization?: string) {
  const req = { headers: { authorization } } as unknown as AuthRequest;
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as unknown as Response;
  const next = vi.fn() as unknown as NextFunction;

  requireAuth(req, res, next);

  return { req, res, next };
}

describe('jwt signing and verification use JWT_SECRET', () => {
  it('signs tokens with JWT_SECRET', () => {
    const token = signToken(user);

    expect(jwt.verify(token, SECRET)).toMatchObject(user);
    expect(() => jwt.verify(token, 'some-other-secret')).toThrow();
  });

  it('verifies tokens signed with JWT_SECRET', () => {
    expect(verifyToken(jwt.sign(user, SECRET))).toMatchObject(user);
  });

  it('round-trips a signed token', () => {
    expect(verifyToken(signToken(user))).toMatchObject(user);
  });

  it('rejects a token signed with the old hardcoded secret', () => {
    const forged = jwt.sign(user, 'seatbook-secret-123');

    expect(() => verifyToken(forged)).toThrow();
  });

  it('rejects tokens signed with another secret, unsigned tokens and other algorithms', () => {
    expect(() => verifyToken(jwt.sign(user, 'another-secret'))).toThrow();
    expect(() => verifyToken(jwt.sign(user, '', { algorithm: 'none' }))).toThrow();
    expect(() => verifyToken(jwt.sign(user, SECRET, { algorithm: 'HS512' }))).toThrow();
  });

  it('sets a 7 day expiry', () => {
    const { iat, exp } = jwt.decode(signToken(user)) as { iat: number; exp: number };

    expect(exp - iat).toBe(7 * 24 * 60 * 60);
  });
});

// requireAuth hands a 401 AppError to the error middleware instead of responding itself.
function expectRejected(next: NextFunction, message: string) {
  expect(next).toHaveBeenCalledOnce();
  expect(vi.mocked(next).mock.calls[0][0]).toMatchObject({ status: 401, message });
}

describe('requireAuth', () => {
  it('lets a request with a valid token through and sets req.user', () => {
    const { req, next } = runRequireAuth(`Bearer ${signToken(user)}`);

    expect(next).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledWith();
    expect(req.user).toMatchObject(user);
  });

  it('rejects a token signed with the old hardcoded secret', () => {
    const forged = jwt.sign({ ...user, role: 'ORGANIZER' }, 'seatbook-secret-123');
    const { req, next } = runRequireAuth(`Bearer ${forged}`);

    expectRejected(next, 'Invalid token');
    expect(req.user).toBeUndefined();
  });

  it('rejects a missing or garbage token', () => {
    expectRejected(runRequireAuth(undefined).next, 'Not logged in');
    expectRejected(runRequireAuth('Bearer not-a-token').next, 'Invalid token');
  });
});
