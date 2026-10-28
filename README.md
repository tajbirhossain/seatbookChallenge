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
- Postgres: `localhost:5433` (user / password / db: `seatbook`)

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

You need a Postgres running at the `DATABASE_URL` in `server/.env`.

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

Send the token as `Authorization: Bearer <token>`.
