import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { PrismaClient } from '@prisma/client';
import type { Express } from 'express';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// The real Express app runs on an ephemeral port and is called over HTTP. Database failures are
// simulated by making Prisma methods reject, so none of these tests need a database.
let server: Server;
let baseUrl: string;
let prisma: PrismaClient;
let Prisma: typeof import('@prisma/client').Prisma;
let signToken: typeof import('../src/lib/jwt.js').signToken;

beforeAll(async () => {
  vi.stubEnv('JWT_SECRET', 'test-secret-for-error-handling-tests');
  vi.resetModules();

  // Default exports arrive wrapped by the module interop, hence the casts.
  const app = (await import('../src/app.js')).default as unknown as Express;
  prisma = (await import('../src/lib/prisma.js')).default as unknown as PrismaClient;
  ({ signToken } = await import('../src/lib/jwt.js'));
  ({ Prisma } = await import('@prisma/client'));

  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const attendee = () => signToken({ id: 1, email: 'a@test.local', role: 'ATTENDEE' });
const organizer = () => signToken({ id: 2, email: 'o@test.local', role: 'ORGANIZER' });

async function call(method: string, path: string, options: { body?: unknown; raw?: string; token?: string } = {}) {
  const headers: Record<string, string> = {};
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.body !== undefined || options.raw !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: options.raw ?? (options.body === undefined ? undefined : JSON.stringify(options.body)),
  });
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  return { status: res.status, json, text };
}

async function expectStillAlive() {
  expect((await call('GET', '/health')).status).toBe(200);
}

const silenceErrorLog = () => vi.spyOn(console, 'error').mockImplementation(() => {});

describe('responses have one shape', () => {
  it('returns 404 JSON for unknown routes', async () => {
    const res = await call('GET', '/nope');

    expect(res.status).toBe(404);
    expect(res.json).toEqual({ error: 'Not found' });
  });

  it('returns 401 { error } when the token is missing or invalid', async () => {
    const missing = await call('GET', '/bookings/mine');
    const invalid = await call('GET', '/bookings/mine', { token: 'garbage' });

    expect(missing).toMatchObject({ status: 401, json: { error: 'Not logged in' } });
    expect(invalid).toMatchObject({ status: 401, json: { error: 'Invalid token' } });
    expect(invalid.json).not.toHaveProperty('message');
  });

  it('uses { error } for validation failures instead of msg or message', async () => {
    const missingFields = await call('POST', '/events', { token: organizer(), body: { title: 'x' } });
    const tooBig = await call('POST', '/events', {
      token: organizer(),
      body: { title: 't', venue: 'v', startsAt: '2031-01-01T10:00:00Z', rows: 27, cols: 5 },
    });
    const notOrganizer = await call('POST', '/events', { token: attendee(), body: {} });

    expect(missingFields).toMatchObject({ status: 400, json: { error: 'Missing required fields' } });
    expect(tooBig).toMatchObject({ status: 400, json: { error: 'Seat grid too large (max 26 rows x 30 cols)' } });
    expect(notOrganizer).toMatchObject({ status: 403, json: { error: 'Only organizers can create events' } });
    expect(tooBig.json).not.toHaveProperty('msg');
  });

  it('returns 404 { error } for a missing event', async () => {
    vi.spyOn(prisma.event, 'findUnique').mockResolvedValue(null);

    expect(await call('GET', '/events/5')).toMatchObject({ status: 404, json: { error: 'Event not found' } });
  });
});

describe('malformed requests are rejected without reaching the database', () => {
  it('returns 400 for invalid JSON without a stack trace', async () => {
    const res = await call('POST', '/auth/login', { raw: '{bad' });

    expect(res.status).toBe(400);
    expect(res.json).toEqual({ error: 'Invalid JSON body' });
    expect(res.text).not.toContain('<pre>');
    expect(res.text).not.toContain('node_modules');
    await expectStillAlive();
  });

  it('returns 413 for an oversized body', async () => {
    const res = await call('POST', '/auth/login', { raw: JSON.stringify({ email: 'x'.repeat(200_000) }) });

    expect(res).toMatchObject({ status: 413, json: { error: 'Request body too large' } });
  });

  it.each(['abc', '1.5', '-1', '0', '99999999999', '12abc'])('returns 400 for GET /events/%s', async (id) => {
    const res = await call('GET', `/events/${id}`);

    expect(res).toMatchObject({ status: 400, json: { error: 'Invalid event id' } });
    await expectStillAlive();
  });

  it.each([
    ['missing password', { email: 'a@test.local' }],
    ['missing email', { password: 'x' }],
    ['non-string password', { email: 'a@test.local', password: 123 }],
    ['object email', { email: { contains: '' }, password: 'x' }],
    ['empty body', {}],
  ])('returns 400 for login with %s', async (_name, body) => {
    const res = await call('POST', '/auth/login', { body });

    expect(res).toMatchObject({ status: 400, json: { error: 'email and password are required' } });
    await expectStillAlive();
  });

  it('returns 400 for register with the wrong types', async () => {
    const res = await call('POST', '/auth/register', { body: { email: 'a@test.local', password: 123, name: ['x'] } });

    expect(res).toMatchObject({ status: 400, json: { error: 'email, password and name are required' } });
  });

  it.each([
    ['missing', undefined],
    ['text', 'abc'],
    ['float', 1.5],
    ['negative', -1],
    ['zero', 0],
    ['boolean', true],
    ['array', [5]],
    ['null', null],
  ])('returns 400 for a booking with seatId %s', async (_name, seatId) => {
    for (const path of ['/bookings', '/bookings/hold']) {
      const res = await call('POST', path, { token: attendee(), body: { seatId } });

      expect(res).toMatchObject({ status: 400, json: { error: 'seatId must be a positive integer' } });
    }
    await expectStillAlive();
  });

  it('returns 400 for bad booking ids and event filters', async () => {
    for (const path of ['/bookings/abc/cancel', '/bookings/abc/confirm', '/bookings/1.5/cancel']) {
      const res = await call('POST', path, { token: attendee() });

      expect(res).toMatchObject({ status: 400, json: { error: 'Invalid booking id' } });
    }
    expect(await call('GET', '/bookings/blocked-seats?eventId=abc', { token: attendee() })).toMatchObject({
      status: 400,
      json: { error: 'eventId must be a positive integer' },
    });
    await expectStillAlive();
  });
});

describe('database errors become safe responses and never crash the API', () => {
  const dbError = (code: string) => new Prisma.PrismaClientKnownRequestError('boom', { code, clientVersion: '5.22.0' });

  it('returns 500 without leaking the error message, then keeps serving', async () => {
    const log = silenceErrorLog();
    vi.spyOn(prisma.event, 'findMany').mockRejectedValue(new Error('connect to postgresql://user:hunter2@db/prod failed'));

    const res = await call('GET', '/events');

    expect(res).toMatchObject({ status: 500, json: { error: 'Internal server error' } });
    expect(res.text).not.toContain('hunter2');
    expect(log).toHaveBeenCalled();
    await expectStillAlive();
  });

  it('returns 503 when the database is unreachable', async () => {
    silenceErrorLog();
    vi.spyOn(prisma.event, 'findMany').mockRejectedValue(
      new Prisma.PrismaClientInitializationError("Can't reach database server at db:5432", '5.22.0')
    );

    expect(await call('GET', '/events')).toMatchObject({
      status: 503,
      json: { error: 'Service temporarily unavailable' },
    });
    await expectStillAlive();
  });

  it.each([
    ['P2002', 409, 'Resource already exists'],
    ['P2025', 404, 'Not found'],
    ['P2003', 409, 'Operation conflicts with existing data'],
    ['P2024', 503, 'Service temporarily unavailable'],
    ['P2028', 503, 'Service temporarily unavailable'],
    ['P1001', 503, 'Service temporarily unavailable'],
    ['P9999', 500, 'Internal server error'],
  ])('maps Prisma %s to %i', async (code, status, message) => {
    silenceErrorLog();
    vi.spyOn(prisma.event, 'findMany').mockRejectedValue(dbError(code));

    expect(await call('GET', '/events')).toMatchObject({ status, json: { error: message } });
    await expectStillAlive();
  });

  it('maps a Prisma validation error to 400', async () => {
    vi.spyOn(prisma.event, 'create').mockRejectedValue(
      new Prisma.PrismaClientValidationError('Argument startsAt: Invalid value', { clientVersion: '5.22.0' })
    );

    const res = await call('POST', '/events', {
      token: organizer(),
      body: { title: 't', venue: 'v', startsAt: 'not a date', rows: 2, cols: 2 },
    });

    expect(res).toMatchObject({ status: 400, json: { error: 'Invalid request data' } });
    expect(res.text).not.toContain('startsAt');
  });

  it('handles database errors in login, register and bookings', async () => {
    silenceErrorLog();
    vi.spyOn(prisma.user, 'findUnique').mockRejectedValue(new Prisma.PrismaClientInitializationError('down', '5.22.0'));
    vi.spyOn(prisma.seat, 'findUnique').mockRejectedValue(dbError('P2024'));
    vi.spyOn(prisma.booking, 'updateMany').mockRejectedValue(new Error('deadlock detected'));

    const login = await call('POST', '/auth/login', { body: { email: 'a@test.local', password: 'x' } });
    const book = await call('POST', '/bookings', { token: attendee(), body: { seatId: 1 } });
    const cancel = await call('POST', '/bookings/1/cancel', { token: attendee() });

    expect(login.status).toBe(503);
    expect(book.status).toBe(503);
    expect(cancel).toMatchObject({ status: 500, json: { error: 'Internal server error' } });
    await expectStillAlive();
  });

  it('no longer hides a failed bookings query behind an empty list', async () => {
    silenceErrorLog();
    vi.spyOn(prisma.booking, 'findMany').mockRejectedValue(dbError('P2024'));

    expect((await call('GET', '/bookings/mine', { token: attendee() })).status).toBe(503);
  });

  it('turns a duplicate email on register into 409', async () => {
    vi.spyOn(prisma.user, 'create').mockRejectedValue(dbError('P2002'));

    const res = await call('POST', '/auth/register', {
      body: { email: 'taken@test.local', password: 'pw12345', name: 'Taken' },
    });

    expect(res).toMatchObject({ status: 409, json: { error: 'Email already registered' } });
  });

  it('survives a burst of failing requests', async () => {
    silenceErrorLog();
    vi.spyOn(prisma.event, 'findMany').mockRejectedValue(new Error('boom'));

    const results = await Promise.all(Array.from({ length: 25 }, () => call('GET', '/events')));

    expect(results.every((r) => r.status === 500)).toBe(true);
    await expectStillAlive();
  });
});
