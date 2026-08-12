# Pussalla Incentivize — Project Memory

## Architecture
- **Backend** (`pussalla-backend/`): Express.js (CommonJS), PostgreSQL via `pg` pool, JWT auth.
  - Routes: auth, divisions, employees, tasks, crossAssignments, dailyLogs, reports, auditLogs.
  - Roles: `employee`, `supervisor`, `hr`, `admin`, `super_admin`.
  - JWT payload: `{ id, code, name, role, homeDivisionId }`.
  - Calc engine handles 3 task types: individual flat-rate, group flat-rate pool (split), group daily-limit/tiered (bonus on excess over target, split among participants).
  - Audit trail auto-flags retroactive edits (edits made after the original log date).
- **Frontend** (`pussalla-frontend/`): Vite + React 18, react-router-dom v6.
  - API client: `src/api/client.js` (matches backend routes).
  - Auth: `src/context/AuthContext.jsx`; Toasts: `src/context/ToastContext.jsx`.
  - Components: `src/components/` (Loaders, Modal, Card, Layout, ProtectedRoute).
  - Pages: Login, Dashboard (role-aware), Earnings, DailyLogs, Tasks, Employees, CrossAssignments, Reports, Audit, NotFound.
  - Theme (Pussalla branding): green/gold/cream palette in `src/styles/theme.css`.
  - Custom loading animations in `src/components/Loaders.jsx`.

## Key Conventions
- `Card.jsx` exports: default `Card`; named: `PageHead`, `KPI`, `EmptyState`, `Badge`, `SkeletonRows`.
  Import as `import Card, { PageHead, KPI, EmptyState, Badge, SkeletonRows } from "../components/Card"`.
- Route guard roles: `/earnings` -> `["employee","super_admin"]`; admin pages -> supervisor/hr/admin/super_admin.

## Running Locally (verification)
- Backend DB: PostgreSQL. Create db `pussalla` with user `pussalla_app` / pass `change_me`.
  - `psql -U pussalla_app -d pussalla -f src/schema.sql` then `npm run seed`.
  - Set `JWT_SECRET` in `pussalla-backend/.env` (from `.env.example`) before `npm start` (port 4000).
- Frontend: `cd pussalla-frontend && npm install && npm run dev` (port 5173, proxies `/api` -> :4000).
- Seed logins (all password `Pussalla@123`): EMP-001 super_admin, EMP-002 hr, EMP-003 admin, EMP-004 supervisor, EMP-009+ employees.

## Build
- `cd pussalla-frontend && npm run build` -> `dist/` (~234KB JS, ~15KB CSS). PASSING.

## Constraints
- Do NOT modify `pussalla-backend/` source. Frontend must match existing backend API as-is.
