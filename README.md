# Pussalla Incentivize System

A full-stack incentive salary & division task management platform for **Pussalla Farms**. Track daily output across all five divisions, calculate payouts with three task engines (individual flat-rate, group flat-rate pool, group daily-limit/tiered bonus), and keep a tamper-evident audit trail — all in one place.

The UI is built with a Pussalla brand identity: deep poultry-green + harvest-gold on a warm cream canvas, with custom loading animations, glassmorphic surfaces, staggered entrance animations, and live status indicators.

---

## ✨ Features

- **Role-based access** — five roles (`employee`, `supervisor`, `hr`, `admin`, `super_admin`), each with a tailored sidebar and dashboard.
- **Daily logs** — capture the three task types with a live calculation preview, participant selection, and per-division filtering.
- **Incentive calculation engine** —
  - *Individual Flat Rate* — `output × rate`.
  - *Group Flat-Rate Pool* — `output × rate`, split equally among participants.
  - *Group Daily Limit / Tiered* — flat pay up to a target; bonus rate on excess, split among participants.
- **Reports** — monthly and daily payout reports, top earners, and CSV export.
- **Audit trail** — every create/update/delete is logged. **Retroactive edits** (changes made after the original log date) are automatically flagged for super-admin review.
- **Pussalla branding** — green/gold/cream palette, animated "egg" loader, pulsing live status dot, animated bar charts, and a dynamic login hero.

---

## 🧱 Tech Stack

| Layer    | Technology |
|----------|-----------|
| Frontend | React 18, Vite 5, React Router v6 (no UI framework — hand-crafted CSS) |
| Backend  | Node.js, Express.js (CommonJS), JWT auth, Helmet, Morgan, CORS |
| Database | PostgreSQL 14+ (via `pg` connection pool) |
| Auth     | JWT with role-based middleware; token stored in `sessionStorage` |

---

## 📁 Project Structure

```
pussalla_Incentivize/
├── pussalla-backend/        # Express.js API (unchanged)
│   ├── src/
│   │   ├── app.js           # Express app, middleware, route mounting
│   │   ├── server.js        # HTTP server entry point
│   │   ├── db.js            # PostgreSQL connection pool
│   │   ├── schema.sql       # Database schema (types, tables, indexes)
│   │   ├── seed.js          # Demo data seeder
│   │   ├── middleware/      # auth, role-gating, audit logging
│   │   ├── routes/          # auth, divisions, employees, tasks,
│   │   │                    #   crossAssignments, dailyLogs, reports, auditLogs
│   │   └── services/        # calculation engine, audit helper
│   ├── .env.example         # Copy to .env and fill in
│   ├── docker-compose.yml   # Postgres for quick local start
│   └── package.json
│
└── pussalla-frontend/       # React SPA (this branch's focus)
    ├── index.html           # Inter + JetBrains Mono fonts, theme color
    ├── vite.config.js       # Dev server + /api proxy → :4000
    ├── public/
    │   └── pussalla-mark.svg
    └── src/
        ├── main.jsx
        ├── App.jsx          # Router + protected routes
        ├── api/client.js    # Fetch wrapper, JWT, all API methods
        ├── context/         # AuthContext, ToastContext
        ├── components/      # Layout, Card, Modal, Loaders, ProtectedRoute
        ├── pages/           # Login, Dashboard, Earnings, DailyLogs,
        │                    #   Tasks, Employees, CrossAssignments,
        │                    #   Reports, Audit, NotFound
        ├── styles/          # theme.css (brand tokens) + app.css (layout)
        └── utils/helpers.js # formatters, role helpers, date helpers
```

---

## 🚀 Quick Start (Run the Full Project)

> **Prerequisites:** [Node.js 18+](https://nodejs.org/) and [PostgreSQL 14+](https://www.postgresql.org/) (or Docker to run Postgres).

### Step 1 — Clone the branch

```bash
git clone -b frontend https://github.com/Neo-Designs/pussalla_Incentivize.git
cd pussalla_Incentivize
```

### Step 2 — Start PostgreSQL

**Option A — Docker (easiest):**

```bash
cd pussalla-backend
docker compose up -d        # starts Postgres 16 on localhost:5432
```

**Option B — Local PostgreSQL:**

Install PostgreSQL, then create the role and database to match the backend config:

```bash
sudo -u postgres psql <<'SQL'
CREATE USER pussalla_app WITH PASSWORD 'change_me';
CREATE DATABASE pussalla OWNER pussalla_app;
GRANT ALL ON SCHEMA public TO pussalla_app;
SQL
```

### Step 3 — Configure the backend

```bash
cd pussalla-backend
cp .env.example .env
```

Open `.env` and set a long random string for `JWT_SECRET` (the rest matches the Postgres defaults from Step 2):

```dotenv
PGHOST=localhost
PGPORT=5432
PGDATABASE=pussalla
PGUSER=pussalla_app
PGPASSWORD=change_me
JWT_SECRET=run openssl rand -hex 32 and paste the output here
JWT_EXPIRES_IN=8h
PORT=4000
CORS_ORIGIN=http://localhost:5173
SEED_DEFAULT_PASSWORD=Pussalla@123
```

### Step 4 — Install backend dependencies & seed the database

```bash
npm install
# Load the schema (tables, types, indexes)
psql "postgres://pussalla_app:change_me@localhost:5432/pussalla" -f src/schema.sql
# Seed demo data (5 divisions, 30 employees, tasks, cross-assignments, daily logs, audit trail)
npm run seed
```

### Step 5 — Start the backend

```bash
npm start          # → http://localhost:4000
# or, with auto-reload:
npm run dev
```

Verify it's up:

```bash
curl http://localhost:4000/api/health
# → {"ok":true,"service":"pussalla-backend"}
```

### Step 6 — Install frontend dependencies & start the dev server

```bash
cd ../pussalla-frontend
npm install
npm run dev        # → http://localhost:5173
```

The Vite dev server proxies `/api` requests to the backend on `:4000`, so no CORS configuration is needed in development.

### Step 7 — Open the app

Browse to **http://localhost:5173** and sign in with a demo account.

---

## 🔑 Demo Logins

The seed script creates 30 employees. **All share the password `Pussalla@123`.**

| Code | Role | Notes |
|------|------|-------|
| `EMP-001` | Super Admin | Full access — all pages + audit trail |
| `EMP-002` | HR | Employees, Cross-Assignments, Reports |
| `EMP-003` | Admin | Task Management, Employees, Reports |
| `EMP-004` | Supervisor | Daily Logs (Processing Plant A) |
| `EMP-009`+ | Employee | Dashboard + My Earnings only |

---

## 🧭 Role → Page Access

| Page | employee | supervisor | hr | admin | super_admin |
|------|:---:|:---:|:---:|:---:|:---:|
| Dashboard | ✅ | ✅ | ✅ | ✅ | ✅ |
| My Earnings | ✅ | — | — | — | ✅ |
| Daily Logs | — | ✅ | — | — | ✅ |
| Task Management | — | — | — | ✅ | ✅ |
| Employees | — | — | ✅ | ✅ | ✅ |
| Cross-Assignments | — | — | ✅ | — | ✅ |
| Reports | — | — | ✅ | ✅ | ✅ |
| Audit Trail | — | — | — | — | ✅ |

---

## 🎨 Frontend Design System

The UI is built with hand-crafted CSS (no Tailwind / no component library) for a distinctive, non-generic aesthetic.

- **Brand palette** — Pussalla green (`#124a24` → `#43a047`) + harvest gold (`#d4a017` → `#ffca28`) on warm cream surfaces (`#f1f5ef`).
- **Typography** — Inter for UI text, JetBrains Mono for codes/figures, with `tabular-nums` for money alignment.
- **Glassmorphism** — translucent, blur-saturated sticky topbar.
- **Custom loaders** — dual-ring spinner, bobbing "egg" loader (farm motif), shimmer skeletons, indeterminate progress bar.
- **Motion** — staggered entrance animations on cards/KPIs, hover lift, animated bar charts that grow on render, pulsing live-status dot, floating gold glow on the login hero, and a shake animation on login errors.
- **Accessibility** — `:focus-visible` rings, `prefers-reduced-motion` support, ARIA labels on loaders/modals.

All design tokens live in `pussalla-frontend/src/styles/theme.css` (`:root` custom properties).

---

## 🏗️ Production Build

To produce a static production bundle of the frontend:

```bash
cd pussalla-frontend
npm run build        # outputs to dist/
npm run preview      # serve the production build locally
```

The built `dist/` can be served by any static host, or placed behind the Express backend / nginx. Because the frontend calls relative `/api` paths, it resolves to the same origin in production.

---

## 📡 API Overview

All routes are prefixed with `/api` and (except `health` and `login`) require a `Authorization: Bearer <jwt>` header.

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/health` | Health check |
| POST | `/api/auth/login` | Authenticate, returns JWT + user |
| GET | `/api/divisions` | List divisions |
| GET/POST/PATCH/DELETE | `/api/employees` | Employee CRUD |
| GET/POST/PATCH/DELETE | `/api/tasks` | Task CRUD |
| GET/POST/DELETE | `/api/cross-assignments` | Cross-division assignments |
| GET/POST/PUT/DELETE | `/api/daily-logs` | Daily log CRUD (triggers calc engine) |
| GET | `/api/reports/monthly?month=YYYY-MM` | Monthly payout report |
| GET | `/api/reports/daily?date=YYYY-MM-DD` | Daily payout report |
| GET | `/api/audit-logs?flagged=true` | Audit trail (filter by flagged) |

The frontend API client (`pussalla-frontend/src/api/client.js`) wraps all of these.

---

## 🧪 Verification

The frontend was verified end-to-end against a live Postgres + backend instance:

- ✅ Login + JWT persistence across roles
- ✅ Role-gated navigation (employee sees only Dashboard + Earnings)
- ✅ Daily logs — all 3 task types render with correct math; create modal works
- ✅ Audit trail — retroactive edits auto-flagged and surfaced for super admin
- ✅ Reports — monthly top earners, CSV export
- ✅ Production build passes (`vite build`, ~234 KB JS / ~22 KB CSS)

---

## 📝 Notes

- The frontend talks to the backend purely through the existing REST API — **no backend files were modified** to build this UI.
- JWT is stored in `sessionStorage` (clears on tab close). For a production deployment with "remember me", consider moving to `localStorage` or an httpOnly cookie.
- The seeded demo data includes illustrative flagged audit entries and cross-division assignments so every page has content on first load.

---

Built for the Pussalla floor — track output, pay fairly, stay accountable.
