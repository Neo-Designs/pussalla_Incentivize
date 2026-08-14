# Incentivize — Incentive Salary Pussalla Incentive Salary & Task Management — Backend Task Management Backend

Node.js (Express) + PostgreSQL API that backs the Incentivize frontend with a real
database, JWT-based multi-user auth, role-based access control, the three
task calculation engines, and an append-only audit log.

## What's included

```
pussalla-backend/
  docker-compose.yml       # optional local Postgres container
  package.json
  .env.example
  src/
    schema.sql              # full DDL: run this once to create tables
    seed.js                 # inserts demo divisions/employees/tasks/logs
    db.js                   # pg connection pool
    app.js / server.js      # Express app + entry point
    middleware/auth.js       # JWT verification + role guard
    utils/calcEngine.js      # Type 1 / 2 / 3 payout formulas
    utils/audit.js           # writes to the immutable audit_logs table
    routes/
      auth.js                # POST /api/auth/login, GET /api/auth/me
      divisions.js
      employees.js            # HR/Admin CRUD
      tasks.js                 # Admin CRUD
      crossAssignments.js      # HR create/list
      dailyLogs.js              # Supervisor entry/edit/delete + engines
      auditLogs.js               # Super Admin read-only audit feed
      reports.js                  # Daily & monthly incentive reports
```

## Step 1 — Install PostgreSQL

**Option A: Docker (fastest)**

```bash
cd pussalla-backend
docker compose up -d
```

This starts Postgres on `localhost:5432` with database `pussalla`, user
`pussalla_app`, password `change_me` (matches `.env.example` — change both
before going to production).

**Option B: Local Postgres install**

Install Postgres 14+ for your OS, then create the database and user:

```bash
psql -U postgres
CREATE DATABASE pussalla;
CREATE USER pussalla_app WITH PASSWORD 'change_me';
GRANT ALL PRIVILEGES ON DATABASE pussalla TO pussalla_app;
\q
```

## Step 2 — Configure environment variables

```bash
cp .env.example .env
```

Edit `.env`:
- Set `PGHOST` / `PGPORT` / `PGDATABASE` / `PGUSER` / `PGPASSWORD` (or a single
  `DATABASE_URL`) to match Step 1.
- Set `JWT_SECRET` to a long random string, e.g. `openssl rand -hex 32`.
- Set `CORS_ORIGIN` to wherever your frontend runs (e.g. `http://localhost:5173`).

## Step 3 — Install dependencies

```bash
npm install
```

## Step 4 — Create the schema

```bash
psql "postgres://pussalla_app:change_me@localhost:5432/pussalla" -f src/schema.sql
```

(Swap in your actual connection details, or use `psql -U pussalla_app -d pussalla -h localhost -f src/schema.sql` and enter the password when prompted.)

## Step 5 — Seed demo data

```bash
npm run seed
```

This populates 5 divisions, 30 employees (with bcrypt-hashed passwords), 11
tasks across the three engine types, 4 cross-assignments, ~20 days of daily
task logs, and a few audit trail entries (including one flagged as a
retroactive edit, so the Super Admin audit dashboard has something to show).

Every seeded employee shares the same login password, set by
`SEED_DEFAULT_PASSWORD` in `.env` (default `Incentivize@123`). Useful logins:

| Role         | Employee code |
|--------------|---------------|
| Super Admin  | `EMP-001`     |
| HR           | `EMP-002`     |
| Admin        | `EMP-003`     |
| Supervisor (Processing Plant A) | `EMP-004` |

## Step 6 — Run the server

```bash
npm run dev      # nodemon, auto-restarts on file changes
# or
npm start        # plain node
```

You should see `Incentivize backend listening on http://localhost:4000`.

## Step 7 — Verify it's working

```bash
curl http://localhost:4000/api/health
# {"ok":true,"service":"pussalla-backend"}

curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"code":"EMP-001","password":"Incentivize@123"}'
# returns { token, user }
```

Use the returned `token` as a Bearer token on every other call, e.g.:

```bash
TOKEN="paste-token-here"
curl http://localhost:4000/api/divisions -H "Authorization: Bearer $TOKEN"

curl -X POST http://localhost:4000/api/daily-logs \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"date":"2026-08-11","divisionId":1,"taskId":1,"entries":[{"employeeId":4,"output":55}]}'
```

(Note: the daily-logs POST route requires a `supervisor` role token, so log
in as `EMP-004` for that particular call — `super_admin` also passes every
role check.)

## Step 8 — Point the frontend at the API

In the React frontend, replace the in-memory `useState` seed data with `fetch`
calls to these endpoints, storing the JWT (e.g. in memory or `sessionStorage`,
not `localStorage` if you want it cleared on tab close) and sending it as
`Authorization: Bearer <token>` on every request. The response shapes mirror
the frontend's existing data model closely (snake_case columns instead of
camelCase) so the mapping is mostly a find-and-replace of the mock arrays for
`fetch()` calls plus a small adapter to rename fields.

## Notes on the auth & RBAC design

- Passwords are hashed with bcrypt (10 rounds); nothing is ever stored in plain text.
- JWTs carry `{ id, code, name, role, homeDivisionId }` and expire per `JWT_EXPIRES_IN` (default 8h).
- `requireRole(...roles)` always lets `super_admin` through, mirroring the demo's role model.
- Every CREATE/UPDATE/DELETE that matters for payroll integrity (`employees`, `tasks`, `cross_assignments`, `daily_task_logs`) writes an `audit_logs` row with JSONB `old_values`/`new_values` in the same DB transaction as the change — if the change fails, the audit entry never commits either.
- Editing a `daily_task_logs` row on a calendar day after its `log_date` is automatically marked `flagged = true`, which is what the Super Admin's "Flagged / Retroactive Only" filter surfaces — this is the month-end manipulation detector from the spec.
- In production, consider revoking `UPDATE`/`DELETE` on `audit_logs` from the application's database role at the Postgres level (see the commented line at the bottom of `schema.sql`) so the trail can't be altered even by a compromised API key.

## Suggested next hardening steps (not included, since this is a reference build)

- Rate limiting / brute-force protection on `/api/auth/login`.
- Refresh tokens or shorter-lived access tokens + refresh flow.
- Input validation library (e.g. `zod`) on all POST/PUT bodies.
- Migrations tool (e.g. `node-pg-migrate` or `Prisma Migrate`) instead of a single `schema.sql` for evolving the schema over time.
- Automated tests (e.g. `jest` + `supertest`) around the three calculation engines and the audit-flagging logic, since those are the parts most likely to matter to an auditor.
