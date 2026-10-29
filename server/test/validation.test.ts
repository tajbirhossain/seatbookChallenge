import '../src/config/env'; // loads server/.env so DATABASE_URL is set when running outside Docker
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { PrismaClient } from '@prisma/client';
import type { Express } from 'express';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { validateLogin, validateRegister } from '../src/modules/auth/auth.validation';
import { validateCreateEvent } from '../src/modules/events/events.validation';

const tomorrow = () => new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
const yesterday = () => new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

const validRegister = { email: 'new@test.local', password: 'password123', name: 'New User' };
const validEvent = () => ({ title: 'Jazz night', venue: 'Main hall', startsAt: tomorrow(), rows: 5, cols: 8 });

const errorOf = (result: any) => ('error' in result ? result.error : undefined);

describe('validateRegister', () => {
  it('accepts valid input and normalizes it', () => {
    expect(validateRegister({ email: '  MiXed@Test.Local ', password: 'password123', name: '  Ann Lee  ' })).toEqual({
      data: { email: 'mixed@test.local', password: 'password123', name: 'Ann Lee' },
    });
  });

  it('ignores fields it does not know about', () => {
    const result = validateRegister({ ...validRegister, role: 'ORGANIZER', id: 1 }) as any;

    expect(Object.keys(result.data).sort()).toEqual(['email', 'name', 'password']);
  });

  it.each([
    ['missing email', { ...validRegister, email: undefined }],
    ['missing password', { ...validRegister, password: undefined }],
    ['missing name', { ...validRegister, name: undefined }],
    ['blank email', { ...validRegister, email: '   ' }],
    ['blank name', { ...validRegister, name: '   ' }],
    ['empty password', { ...validRegister, password: '' }],
    ['numeric email', { ...validRegister, email: 5 }],
    ['numeric password', { ...validRegister, password: 12345678 }],
    ['array name', { ...validRegister, name: ['x'] }],
    ['object email', { ...validRegister, email: { contains: '' } }],
    ['null password', { ...validRegister, password: null }],
    ['no body', undefined],
  ])('requires string fields: %s', (_name, body) => {
    expect(errorOf(validateRegister(body))).toBe('email, password and name are required');
  });

  it.each(['plain', 'a@b', '@x.com', 'a b@x.com', 'a@@x.com', 'a@x', 'a@x .com', `${'a'.repeat(250)}@x.com`])(
    'rejects the invalid email %j',
    (email) => {
      expect(errorOf(validateRegister({ ...validRegister, email }))).toBe('email must be a valid email address');
    }
  );

  it('enforces the password length limits', () => {
    expect(errorOf(validateRegister({ ...validRegister, password: '1234567' }))).toBe(
      'password must be at least 8 characters'
    );
    expect(errorOf(validateRegister({ ...validRegister, password: 'a'.repeat(8) }))).toBeUndefined();
    expect(errorOf(validateRegister({ ...validRegister, password: 'a'.repeat(72) }))).toBeUndefined();
    expect(errorOf(validateRegister({ ...validRegister, password: 'a'.repeat(73) }))).toBe(
      'password is too long (max 72 bytes)'
    );
  });

  it('counts password length in bytes, because bcrypt cuts at 72 bytes', () => {
    // 25 characters but 75 bytes
    expect(errorOf(validateRegister({ ...validRegister, password: 'é'.repeat(37) + 'ab' }))).toBe(
      'password is too long (max 72 bytes)'
    );
    expect(errorOf(validateRegister({ ...validRegister, password: '€'.repeat(24) }))).toBeUndefined();
  });

  it('limits the name to 100 characters', () => {
    expect(errorOf(validateRegister({ ...validRegister, name: 'n'.repeat(100) }))).toBeUndefined();
    expect(errorOf(validateRegister({ ...validRegister, name: 'n'.repeat(101) }))).toBe(
      'name must be at most 100 characters'
    );
  });
});

describe('validateLogin', () => {
  it('normalizes the email and keeps the password as typed', () => {
    expect(validateLogin({ email: ' Alice@Seatbook.Test ', password: ' Pass word ' })).toEqual({
      data: { email: 'alice@seatbook.test', password: ' Pass word ' },
    });
  });

  it('does not apply the sign-up password rules, so existing short passwords still work', () => {
    expect(errorOf(validateLogin({ email: 'a@test.local', password: 'abc' }))).toBeUndefined();
  });

  it.each([
    ['no password', { email: 'a@test.local' }],
    ['no email', { password: 'x' }],
    ['blank email', { email: ' ', password: 'x' }],
    ['numeric password', { email: 'a@test.local', password: 123 }],
    ['object email', { email: { contains: '' }, password: 'x' }],
    ['array password', { email: 'a@test.local', password: ['x'] }],
    ['no body', undefined],
  ])('requires both as strings: %s', (_name, body) => {
    expect(errorOf(validateLogin(body))).toBe('email and password are required');
  });

  it('rejects absurdly long values', () => {
    expect(errorOf(validateLogin({ email: `${'a'.repeat(300)}@x.com`, password: 'x' }))).toBe(
      'email or password is too long'
    );
    expect(errorOf(validateLogin({ email: 'a@test.local', password: 'x'.repeat(1001) }))).toBe(
      'email or password is too long'
    );
  });
});

describe('validateCreateEvent', () => {
  it('accepts a valid event, trims text and defaults description and price', () => {
    const startsAt = tomorrow();

    expect(
      validateCreateEvent({ title: '  Jazz night ', venue: ' Main hall ', startsAt, rows: 26, cols: 30 })
    ).toEqual({
      data: { title: 'Jazz night', description: '', venue: 'Main hall', startsAt, rows: 26, cols: 30, priceCents: 0 },
    });
  });

  it('keeps a description and price when given, and drops unknown fields', () => {
    const result = validateCreateEvent({
      ...validEvent(),
      description: 'Live music',
      priceCents: 1500,
      organizerId: 99,
      id: 5,
    }) as any;

    expect(result.data).toMatchObject({ description: 'Live music', priceCents: 1500 });
    expect(Object.keys(result.data).sort()).toEqual(
      ['cols', 'description', 'priceCents', 'rows', 'startsAt', 'title', 'venue']
    );
  });

  it('accepts a null or empty description and a date-only start', () => {
    expect((validateCreateEvent({ ...validEvent(), description: null }) as any).data.description).toBe('');
    expect((validateCreateEvent({ ...validEvent(), description: '' }) as any).data.description).toBe('');
    expect(errorOf(validateCreateEvent({ ...validEvent(), startsAt: tomorrow().slice(0, 10) }))).toBeUndefined();
  });

  it.each(['title', 'venue', 'startsAt', 'rows', 'cols'])('reports %s as missing', (field) => {
    for (const empty of [undefined, null, '']) {
      expect(errorOf(validateCreateEvent({ ...validEvent(), [field]: empty }))).toBe('Missing required fields');
    }
  });

  it('validates title and venue', () => {
    expect(errorOf(validateCreateEvent({ ...validEvent(), title: '   ' }))).toMatch(/^title must be text/);
    expect(errorOf(validateCreateEvent({ ...validEvent(), title: 'x'.repeat(201) }))).toMatch(/^title must be text/);
    expect(errorOf(validateCreateEvent({ ...validEvent(), title: 42 }))).toMatch(/^title must be text/);
    expect(errorOf(validateCreateEvent({ ...validEvent(), venue: ['v'] }))).toMatch(/^venue must be text/);
    expect(errorOf(validateCreateEvent({ ...validEvent(), venue: 'v'.repeat(201) }))).toMatch(/^venue must be text/);
    expect(errorOf(validateCreateEvent({ ...validEvent(), title: 'x'.repeat(200) }))).toBeUndefined();
  });

  it('validates the description', () => {
    expect(errorOf(validateCreateEvent({ ...validEvent(), description: 5 }))).toMatch(/^description must be text/);
    expect(errorOf(validateCreateEvent({ ...validEvent(), description: 'd'.repeat(5001) }))).toMatch(
      /^description must be text/
    );
    expect(errorOf(validateCreateEvent({ ...validEvent(), description: 'd'.repeat(5000) }))).toBeUndefined();
  });

  it.each(['garbage', '2031-13-45', 'tomorrow', '12/25/2031', 1893456000000, true, ['2031-01-01']])(
    'rejects the invalid date %j',
    (startsAt) => {
      expect(errorOf(validateCreateEvent({ ...validEvent(), startsAt }))).toBe('startsAt must be a valid ISO 8601 date');
    }
  );

  it('rejects start times that are not in the future', () => {
    expect(errorOf(validateCreateEvent({ ...validEvent(), startsAt: yesterday() }))).toBe(
      'startsAt must be in the future'
    );
    expect(errorOf(validateCreateEvent({ ...validEvent(), startsAt: '2001-01-01T00:00:00Z' }))).toBe(
      'startsAt must be in the future'
    );
  });

  it.each(['rows', 'cols'])('requires %s to be a whole number of at least 1', (field) => {
    for (const bad of [0, -1, -5, 1.5, '5', true, [3], {}]) {
      const message = errorOf(validateCreateEvent({ ...validEvent(), [field]: bad }));

      // 0 counts as missing only when it is falsy-empty; every bad value must be rejected either way
      expect(message).toBe(`${field} must be a whole number of at least 1`);
    }
  });

  it('enforces the seat grid size', () => {
    const tooBig = 'Seat grid too large (max 26 rows x 30 cols)';

    expect(errorOf(validateCreateEvent({ ...validEvent(), rows: 27 }))).toBe(tooBig);
    expect(errorOf(validateCreateEvent({ ...validEvent(), cols: 31 }))).toBe(tooBig);
    expect(errorOf(validateCreateEvent({ ...validEvent(), rows: 26, cols: 30 }))).toBeUndefined();
    expect(errorOf(validateCreateEvent({ ...validEvent(), rows: 1, cols: 1 }))).toBeUndefined();
  });

  it('validates the price', () => {
    const message = 'priceCents must be a whole number between 0 and 100000000';

    for (const bad of [-1, 1.5, '100', null, true, [5], 100_000_001]) {
      expect(errorOf(validateCreateEvent({ ...validEvent(), priceCents: bad }))).toBe(message);
    }
    expect(errorOf(validateCreateEvent({ ...validEvent(), priceCents: 0 }))).toBeUndefined();
    expect(errorOf(validateCreateEvent({ ...validEvent(), priceCents: 100_000_000 }))).toBeUndefined();
  });

  it('handles a missing body', () => {
    expect(errorOf(validateCreateEvent(undefined))).toBe('Missing required fields');
  });
});

// The same rules over HTTP, with Prisma stubbed: a rejected request must never reach the database.
describe('validation over HTTP', () => {
  let server: Server;
  let baseUrl: string;
  let prisma: PrismaClient;
  let signToken: typeof import('../src/lib/jwt.js').signToken;

  beforeAll(async () => {
    vi.stubEnv('JWT_SECRET', 'test-secret-for-validation-tests');
    vi.resetModules(); // config/env was imported above, before the secret was set

    const app = (await import('../src/app.js')).default as unknown as Express;
    prisma = (await import('../src/lib/prisma.js')).default as unknown as PrismaClient;
    ({ signToken } = await import('../src/lib/jwt.js'));

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

  async function call(method: string, path: string, options: { body?: unknown; token?: string } = {}) {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    return { status: res.status, json: (await res.json().catch(() => undefined)) as any };
  }

  describe('auth', () => {
    it.each([
      ['an invalid email', { ...validRegister, email: 'not-an-email' }, 'email must be a valid email address'],
      ['a short password', { ...validRegister, password: 'short' }, 'password must be at least 8 characters'],
      ['a long password', { ...validRegister, password: 'p'.repeat(80) }, 'password is too long (max 72 bytes)'],
      ['a long name', { ...validRegister, name: 'n'.repeat(101) }, 'name must be at most 100 characters'],
      ['a non-string field', { ...validRegister, name: 5 }, 'email, password and name are required'],
    ])('rejects register with %s with 400 and never touches the database', async (_name, body, message) => {
      const create = vi.spyOn(prisma.user, 'create').mockRejectedValue(new Error('create must not be called'));

      const res = await call('POST', '/auth/register', { body });

      expect(res).toMatchObject({ status: 400, json: { error: message } });
      expect(create).not.toHaveBeenCalled();
    });

    it('stores a trimmed name and a lowercase email', async () => {
      const create = vi.spyOn(prisma.user, 'create').mockImplementation(((args: any) =>
        Promise.resolve({ id: 7, ...args.data })) as any);

      const res = await call('POST', '/auth/register', {
        body: { email: ' MiXed@Test.Local ', password: 'password123', name: '  Ann Lee ' },
      });

      expect(res.status).toBe(201);
      expect((create.mock.calls[0][0] as any).data).toMatchObject({ email: 'mixed@test.local', name: 'Ann Lee' });
      expect(res.json.user).toMatchObject({ email: 'mixed@test.local', name: 'Ann Lee' });
    });

    it('looks users up by lowercase email on login', async () => {
      const find = vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(null);

      const res = await call('POST', '/auth/login', { body: { email: ' Alice@Seatbook.TEST ', password: 'x' } });

      expect(res.status).toBe(401);
      expect((find.mock.calls[0][0] as any).where).toEqual({ email: 'alice@seatbook.test' });
    });

    it('rejects login with oversized values without querying', async () => {
      const find = vi.spyOn(prisma.user, 'findUnique').mockRejectedValue(new Error('findUnique must not be called'));

      const res = await call('POST', '/auth/login', { body: { email: 'a@test.local', password: 'x'.repeat(2000) } });

      expect(res).toMatchObject({ status: 400, json: { error: 'email or password is too long' } });
      expect(find).not.toHaveBeenCalled();
    });
  });

  describe('event creation', () => {
    it.each([
      ['a past date', { ...validEvent(), startsAt: yesterday() }, 'startsAt must be in the future'],
      ['an invalid date', { ...validEvent(), startsAt: 'not a date' }, 'startsAt must be a valid ISO 8601 date'],
      ['zero rows', { ...validEvent(), rows: 0 }, 'rows must be a whole number of at least 1'],
      ['negative cols', { ...validEvent(), cols: -4 }, 'cols must be a whole number of at least 1'],
      ['fractional rows', { ...validEvent(), rows: 2.5 }, 'rows must be a whole number of at least 1'],
      ['string rows', { ...validEvent(), rows: '5' }, 'rows must be a whole number of at least 1'],
      ['a huge grid', { ...validEvent(), rows: 100, cols: 100 }, 'Seat grid too large (max 26 rows x 30 cols)'],
      ['a negative price', { ...validEvent(), priceCents: -500 }, 'priceCents must be a whole number between 0 and 100000000'],
      ['a null price', { ...validEvent(), priceCents: null }, 'priceCents must be a whole number between 0 and 100000000'],
      ['a blank title', { ...validEvent(), title: '   ' }, 'title must be text of 1 to 200 characters'],
      ['a huge description', { ...validEvent(), description: 'd'.repeat(6000) }, 'description must be text of at most 5000 characters'],
      ['missing fields', { title: 'x' }, 'Missing required fields'],
    ])('rejects %s with 400 and never touches the database', async (_name, body, message) => {
      const create = vi.spyOn(prisma.event, 'create').mockRejectedValue(new Error('create must not be called'));

      const res = await call('POST', '/events', { token: organizer(), body });

      expect(res).toMatchObject({ status: 400, json: { error: message } });
      expect(create).not.toHaveBeenCalled();
    });

    it('creates the event from the cleaned values', async () => {
      const startsAt = tomorrow();
      const create = vi.spyOn(prisma.event, 'create').mockImplementation(((args: any) =>
        Promise.resolve({ id: 5, ...args.data, seats: undefined })) as any);

      const res = await call('POST', '/events', {
        token: organizer(),
        body: { title: '  Jazz night ', venue: ' Hall ', startsAt, rows: 2, cols: 3, organizerId: 99 },
      });

      const data = (create.mock.calls[0][0] as any).data;
      expect(res.status).toBe(201);
      expect(data).toMatchObject({ title: 'Jazz night', venue: 'Hall', description: '', rows: 2, cols: 3, priceCents: 0 });
      expect(data.organizerId).toBe(2); // from the token, never from the body
      expect(data.seats.create).toHaveLength(6);
    });

    it('still checks the role before the body', async () => {
      const res = await call('POST', '/events', { token: attendee(), body: { title: 'x' } });

      expect(res).toMatchObject({ status: 403, json: { error: 'Only organizers can create events' } });
    });
  });

  describe('route parameters and booking input', () => {
    it.each(['abc', '1.5', '-1', '0', '1e3', '0x10', '+5', '%205', '12abc', '99999999999', '%D9%A1%D9%A2'])(
      'rejects the id %s with 400 on every route that takes one',
      async (id) => {
        const findEvent = vi.spyOn(prisma.event, 'findUnique');
        const updateBookings = vi.spyOn(prisma.booking, 'updateMany');

        const results = await Promise.all([
          call('GET', `/events/${id}`),
          call('POST', `/bookings/${id}/cancel`, { token: attendee() }),
          call('POST', `/bookings/${id}/confirm`, { token: attendee() }),
        ]);

        expect(results.map((r) => r.status)).toEqual([400, 400, 400]);
        expect(results[0].json.error).toBe('Invalid event id');
        expect(results[1].json.error).toBe('Invalid booking id');
        expect(findEvent).not.toHaveBeenCalled();
        expect(updateBookings).not.toHaveBeenCalled();
      }
    );

    it('accepts a normal id and passes it to the database as a number', async () => {
      const find = vi.spyOn(prisma.event, 'findUnique').mockResolvedValue(null);

      const res = await call('GET', '/events/007');

      expect(res.status).toBe(404);
      expect((find.mock.calls[0][0] as any).where).toEqual({ id: 7 });
    });

    it.each([undefined, null, 'abc', '', 1.5, 0, -2, true, [3], {}, 2147483648])(
      'rejects seatId %j with 400 on hold and book',
      async (seatId) => {
        const findSeat = vi.spyOn(prisma.seat, 'findUnique');

        for (const path of ['/bookings', '/bookings/hold']) {
          const res = await call('POST', path, { token: attendee(), body: { seatId } });

          expect(res).toMatchObject({ status: 400, json: { error: 'seatId must be a positive integer' } });
        }
        expect(findSeat).not.toHaveBeenCalled();
      }
    );

    it('accepts a numeric string seatId and uses it as a number', async () => {
      const findSeat = vi.spyOn(prisma.seat, 'findUnique').mockResolvedValue(null);

      const res = await call('POST', '/bookings', { token: attendee(), body: { seatId: '15' } });

      expect(res.status).toBe(404);
      expect((findSeat.mock.calls[0][0] as any).where).toEqual({ id: 15 });
    });

    it.each(['eventId=abc', 'eventId=', 'eventId=1.5', 'eventId=0', 'eventId=1&eventId=2'])(
      'rejects the blocked-seats filter ?%s with 400',
      async (query) => {
        const res = await call('GET', `/bookings/blocked-seats?${query}`, { token: attendee() });

        expect(res).toMatchObject({ status: 400, json: { error: 'eventId must be a positive integer' } });
      }
    );
  });
});

// Real database: normalized emails make sign-up and login case-insensitive.
describe.skipIf(!process.env.DATABASE_URL)('email normalization against the database', () => {
  let server: Server;
  let baseUrl: string;
  let prisma: PrismaClient;
  const email = `Validation-${Date.now()}@Test.Local`;

  beforeAll(async () => {
    vi.stubEnv('JWT_SECRET', 'test-secret-for-validation-db-tests');
    vi.resetModules();

    const app = (await import('../src/app.js')).default as unknown as Express;
    prisma = (await import('../src/lib/prisma.js')).default as unknown as PrismaClient;

    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    await prisma.user.deleteMany({ where: { email: email.toLowerCase() } });
    await prisma.$disconnect();
    vi.unstubAllEnvs();
  });

  const post = async (path: string, body: unknown) => {
    const res = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: res.status, json: (await res.json().catch(() => undefined)) as any };
  };

  it('treats the same email in a different case as the same account', async () => {
    const first = await post('/auth/register', { email, password: 'password123', name: 'Case Test' });
    const duplicate = await post('/auth/register', { email: email.toUpperCase(), password: 'password123', name: 'Dup' });
    const loginOtherCase = await post('/auth/login', { email: email.toLowerCase().toUpperCase(), password: 'password123' });
    const stored = await prisma.user.findMany({ where: { email: { equals: email, mode: 'insensitive' } } });

    expect(first.status).toBe(201);
    expect(first.json.user.email).toBe(email.toLowerCase());
    expect(duplicate).toMatchObject({ status: 409, json: { error: 'Email already registered' } });
    expect(loginOtherCase.status).toBe(200);
    expect(stored).toHaveLength(1);
    expect(stored[0].email).toBe(email.toLowerCase());
  });
});
