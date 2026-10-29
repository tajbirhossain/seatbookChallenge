import '../src/config/env'; // loads server/.env so DATABASE_URL is set when running outside Docker
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { PrismaClient } from '@prisma/client';
import type { Express } from 'express';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

let server: Server;
let baseUrl: string;
let prisma: PrismaClient;

beforeAll(async () => {
  vi.stubEnv('JWT_SECRET', 'test-secret-for-register-role-tests');
  vi.resetModules(); // config/env was imported above, before the secret was set

  const app = (await import('../src/app.js')).default as unknown as Express;
  prisma = (await import('../src/lib/prisma.js')).default as unknown as PrismaClient;

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

async function post(path: string, body: unknown, token?: string) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json().catch(() => undefined)) as any };
}

const claimedRoles: [string, unknown][] = [
  ['ORGANIZER', 'ORGANIZER'],
  ['lowercase organizer', 'organizer'],
  ['padded ORGANIZER', ' ORGANIZER '],
  ['ADMIN', 'ADMIN'],
  ['array', ['ORGANIZER']],
  ['object', { toString: 'ORGANIZER' }],
  ['true', true],
];

// These run without a database: Prisma is stubbed to echo back what the app tried to store.
describe('registration never takes the role from the request', () => {
  function stubUserCreate() {
    return vi.spyOn(prisma.user, 'create').mockImplementation((async (args: any) => ({
      id: 99,
      email: args.data.email,
      name: args.data.name,
      role: args.data.role,
    })) as any);
  }

  it.each(claimedRoles)('stores ATTENDEE when the request asks for %s', async (_name, role) => {
    const create = stubUserCreate();

    const res = await post('/auth/register', { email: 'new@test.local', password: 'password123', name: 'New', role });

    expect(res.status).toBe(201);
    expect(create).toHaveBeenCalledOnce();
    expect((create.mock.calls[0][0] as any).data.role).toBe('ATTENDEE');
    expect(res.json.user.role).toBe('ATTENDEE');
    expect((jwt.decode(res.json.token) as any).role).toBe('ATTENDEE');
  });

  it('registers as ATTENDEE when no role is sent', async () => {
    const create = stubUserCreate();

    const res = await post('/auth/register', { email: 'plain@test.local', password: 'password123', name: 'Plain' });

    expect(res.status).toBe(201);
    expect((create.mock.calls[0][0] as any).data.role).toBe('ATTENDEE');
    expect(res.json.user.role).toBe('ATTENDEE');
  });

  it('does not pass any other client-supplied field through to the database', async () => {
    const create = stubUserCreate();

    await post('/auth/register', { email: 'x@test.local', password: 'password123', name: 'X', role: 'ORGANIZER', id: 1 });

    expect(Object.keys((create.mock.calls[0][0] as any).data).sort()).toEqual(['email', 'name', 'passwordHash', 'role']);
  });
});

// These use the real database: the full path from sign-up to what the account can do.
describe.skipIf(!process.env.DATABASE_URL)('self-registered accounts cannot act as organizers', () => {
  const runId = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const emails: string[] = [];
  const eventIds: number[] = [];
  let counter = 0;

  const newEmail = () => {
    const email = `registerrole-${runId}-${counter++}@test.local`;
    emails.push(email);
    return email;
  };

  const validEvent = {
    title: 'Register role test',
    venue: 'test',
    startsAt: '2031-01-01T10:00:00Z',
    rows: 2,
    cols: 2,
  };

  afterAll(async () => {
    const users = await prisma.user.findMany({ where: { email: { in: emails } }, select: { id: true } });
    const ids = users.map((u) => u.id);
    await prisma.event.deleteMany({ where: { OR: [{ id: { in: eventIds } }, { organizerId: { in: ids } }] } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });

  it('saves an attendee, and that account cannot create events', async () => {
    const email = newEmail();

    const registered = await post('/auth/register', { email, password: 'password123', name: 'Sneaky', role: 'ORGANIZER' });
    const stored = await prisma.user.findUniqueOrThrow({ where: { email } });
    const created = await post('/events', validEvent, registered.json.token);

    expect(registered.status).toBe(201);
    expect(registered.json.user.role).toBe('ATTENDEE');
    expect(stored.role).toBe('ATTENDEE');
    expect(created).toMatchObject({ status: 403, json: { error: 'Only organizers can create events' } });
  });

  it('stays an attendee after logging in again', async () => {
    const email = newEmail();
    await post('/auth/register', { email, password: 'password123', name: 'Again', role: 'ORGANIZER' });

    const login = await post('/auth/login', { email, password: 'password123' });
    const created = await post('/events', validEvent, login.json.token);

    expect(login.json.user.role).toBe('ATTENDEE');
    expect(created.status).toBe(403);
  });

  it('still registers a normal attendee who sends no role', async () => {
    const email = newEmail();

    const registered = await post('/auth/register', { email, password: 'password123', name: 'Normal' });

    expect(registered.status).toBe(201);
    expect(registered.json.user).toMatchObject({ email, name: 'Normal', role: 'ATTENDEE' });
  });

  describe('existing organizer accounts are unaffected', () => {
    it('can log in as an organizer and create events', async () => {
      const email = newEmail();
      await prisma.user.create({
        data: { email, name: 'Existing Organizer', passwordHash: await bcrypt.hash('password123', 10), role: 'ORGANIZER' },
      });

      const login = await post('/auth/login', { email, password: 'password123' });
      const created = await post('/events', validEvent, login.json.token);
      if (created.json?.id) eventIds.push(created.json.id);

      expect(login.json.user.role).toBe('ORGANIZER');
      expect((jwt.decode(login.json.token) as any).role).toBe('ORGANIZER');
      expect(created.status).toBe(201);
      expect(created.json).toMatchObject({ title: validEvent.title, rows: 2, cols: 2 });
    });

    it('still rejects invalid events with the usual validation errors', async () => {
      const email = newEmail();
      await prisma.user.create({
        data: { email, name: 'Organizer Two', passwordHash: await bcrypt.hash('password123', 10), role: 'ORGANIZER' },
      });
      const { json } = await post('/auth/login', { email, password: 'password123' });

      expect(await post('/events', { title: 'x' }, json.token)).toMatchObject({
        status: 400,
        json: { error: 'Missing required fields' },
      });
    });
  });
});
