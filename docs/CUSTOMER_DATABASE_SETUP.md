# Customer Database Setup Guide

This guide walks you through provisioning a fresh PostgreSQL database for a new
Pussalla Incentive System customer and getting the app running against it.

The system is **multi-company-ready**: every customer runs an isolated database
with their own employees, divisions and tasks. There is no shared multi-tenant
cluster — each customer is fully isolated.

---

## Option A — Neon (recommended, free tier)

1. Create a free account at **https://neon.tech**.
2. Click **New Project** → name it (e.g. `pussalla-acme`) → pick a region close
   to the customer → **Create**.
3. On the project dashboard, copy the **Connection string**. It looks like:
   ```
   postgresql://pussalla_app:********@ep-xxx-pooler.region.aws.neon.tech/pussalla?sslmode=require
   ```
4. Use this as `DATABASE_URL` in your `.env` (see step 4 below).

## Option B — Supabase

1. Create a free project at **https://supabase.com**.
2. In **Project Settings → Database → Connection string → URI**, copy the
   connection string.
3. Use it as `DATABASE_URL` in your `.env`.

## Option C — Self-hosted PostgreSQL

```bash
docker run -d --name pussalla-db \
  -e POSTGRES_DB=pussalla \
  -e POSTGRES_USER=pussalla_app \
  -e POSTGRES_PASSWORD=CHANGE_ME_STRONG \
  -v pussalla_pgdata:/var/lib/postgresql/data \
  -p 5432:5432 \
  postgres:16
```

Use individual `PGHOST`/`PGPORT`/`PGDATABASE`/`PGUSER`/`PGPASSWORD` env vars,
or `DATABASE_URL`, in your `.env`.

---

## Step-by-step: bring a new customer online

### 1. Provision the database
Use one of the options above. Note the connection string / credentials.

### 2. Clone the repository
```bash
git clone https://github.com/Neo-Designs/pussalla_Incentivize.git
cd pussalla_Incentivize
```

### 3. Apply the schema
The schema creates all tables, indexes, and the default `companies` row.

**With `psql`** (Neon/Supabase web SQL editor works too):
```bash
psql "$DATABASE_URL" -f pussalla-backend/src/schema.sql
psql "$DATABASE_URL" -f pussalla-backend/src/migrations/001_scale_and_tenants.sql
```

> Neon/Supabase: paste the contents of `src/schema.sql` then
> `src/migrations/001_scale_and_tenants.sql` into the SQL editor and run.

### 4. Configure environment
```bash
cp pussalla-backend/.env.example .env
```
Edit `.env`:
| Variable | Value |
|---|---|
| `DATABASE_URL` | your Neon/Supabase connection string (takes priority over PG*) |
| `JWT_SECRET` | a long random string (`openssl rand -hex 32`) |
| `JWT_EXPIRES_IN` | `8h` (or your session length) |
| `CORS_ORIGIN` | the public URL the frontend will be served from (e.g. `https://incentive.acme.lk`), or leave empty when serving the frontend from the same origin |
| `SEED_DEFAULT_PASSWORD` | the initial password for seeded logins |

### 5. Start the app

**Docker (recommended for production):**
```bash
docker compose -f docker-compose.prod.yml --env-file .env up --build -d
```
This builds the React frontend, installs backend deps, and runs everything on
port 4000 (frontend + API from one origin).

**Without Docker (development):**
```bash
# backend
cd pussalla-backend && npm ci && npm run seed && npm start
# frontend (separate terminal)
cd pussalla-frontend && npm ci && npm run dev
```

### 6. Load demo data
```bash
# inside the running container, or locally with deps installed:
cd pussalla-backend && npm run seed
```
This creates the demo divisions, 30 sample employees, and 11 incentive tasks.
Default login: **EMP-001** / the `SEED_DEFAULT_PASSWORD` you set.

### 7. Lock down
- Change the super-admin password immediately after first login.
- Rotate `JWT_SECRET` to a fresh value for the customer (don't reuse the
  seed default).
- Set `CORS_ORIGIN` to the customer's exact domain.

---

## Where data lives

| Table | Contents |
|---|---|
| `companies` | Customer identity (single row per database) |
| `divisions` | The customer's operational divisions |
| `employees` | Staff logins, roles, home division |
| `tasks` | Incentive task definitions per division |
| `daily_task_logs` | Output logged per day per task |
| `task_participants` | Who worked on each log + their share |
| `cross_assignments` | Employees temporarily working in another division |
| `audit_logs` | Immutable change history (never updated/deleted) |

Each customer database is fully independent. To onboard another customer,
repeat this guide with a **new** database project.
