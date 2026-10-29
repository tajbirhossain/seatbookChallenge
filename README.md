# Seatbook

Seat booking for small venues. Organizers publish an event with a seat grid, attendees pick a seat and book it.

## Stack

- **server/**: Node, Express, TypeScript, Prisma, Postgres
- **client/**: React, Vite, TypeScript, Tailwind

## Run it

```bash
docker compose up --build
```

- App: http://localhost:5173
- API: http://localhost:4000
- Postgres: `localhost:5433` (user / password / db: `seatbook`), reachable from this machine only

This setup is for local development only: its credentials are public and the seeded accounts have a known password. The server refuses to start with them when `NODE_ENV=production`.

The database is migrated and seeded on first start. To start from a clean database: `docker compose down -v`.

**After changing `schema.prisma`:** create the migration from your machine (`cd server && npx prisma migrate dev`, with `DATABASE_URL` pointing at `localhost:5433`), then `docker compose restart server`. The server regenerates the Prisma client and applies migrations on start.

### Seeded accounts

All passwords are `password123`.

| Email | Role |
|---|---|
| organizer@seatbook.test | Organizer |
| alice@seatbook.test | Attendee |
| bob@seatbook.test | Attendee |

### Without Docker

```bash
cd server && cp .env.example .env && npm install && npm run db:migrate && npm run db:seed && npm run dev
cd client && npm install && npm run dev
```

You need a Postgres running at the `DATABASE_URL` in `server/.env`, and a `JWT_SECRET` there too: the server refuses to start without one.

### Production

`docker-compose.prod.yml` runs the database and the API with no default credentials. Compose will not start until you provide both secrets, and the API itself refuses to boot with a weak or placeholder `JWT_SECRET` (under 32 characters, or `change-me`-style) or a default database password. It never seeds the database, and the database port is not published.

```bash
export POSTGRES_PASSWORD=$(openssl rand -hex 24)   # hex keeps the password safe inside a URL
export JWT_SECRET=$(openssl rand -hex 32)
docker compose -f docker-compose.prod.yml up -d --build
```

No `openssl`? Use `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Set `SERVER_PORT` to publish the API on a port other than 4000. The web client is not part of this stack: build it with `npm run build` in `client/` and serve `client/dist` from a static host, with `VITE_API_URL` set to the API's public URL.

## Scripts

| | server | client |
|---|---|---|
| `npm run dev` | API with reload | Vite dev server |
| `npm run typecheck` | `tsc --noEmit` | `tsc --noEmit` |
| `npm test` | Vitest | none yet |

## API

| Method | Path | Auth | What it does |
|---|---|---|---|
| POST | `/auth/register` | none | Create an account, returns a token |
| POST | `/auth/login` | none | Log in, returns a token |
| GET | `/events` | none | List events with seats left |
| GET | `/events/:id` | none | One event with its seat map |
| POST | `/events` | organizer | Create an event and its seats |
| POST | `/bookings` | attendee | Book a seat |
| POST | `/bookings/hold` | attendee | Hold a seat for 10 minutes |
| POST | `/bookings/:id/confirm` | attendee | Turn your unexpired hold into a booking |
| GET | `/bookings/holds` | attendee | Your active holds |
| GET | `/bookings/blocked-seats` | attendee | Seats you can no longer take because your hold on them expired (`?eventId=` to filter) |
| GET | `/bookings/mine` | attendee | Your bookings |
| POST | `/bookings/:id/cancel` | attendee | Cancel a booking |

A held seat shows as unavailable to everyone else until the hold is confirmed or its 10 minutes run out. `POST /bookings` still books a seat directly, and confirms your own hold on that seat if you have one.

Every error response is JSON shaped `{ "error": "message" }`: 400 for malformed input, 401 not logged in, 403 not allowed, 404 not found, 409 conflict, 503 when the database is unreachable and 500 for anything unexpected (details are logged on the server, never sent).

Send the token as `Authorization: Bearer <token>`.
