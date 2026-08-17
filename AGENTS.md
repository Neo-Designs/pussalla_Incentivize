# Incentivize — Project Memory

> NOTE: The product was rebranded from "Pussalla Incentive System" to "Incentivize".
> Directory/package names (`pussalla-backend`, `pussalla-frontend`, `pussalla_app` DB user, `pussalla` DB)
> are kept as technical identifiers for stability; user-facing branding text is "Incentivize".
> Demo seed password changed from `Pussalla@123` to `Incentivize@123`.

## Architecture
- **Backend** (`pussalla-backend/`): Express.js (CommonJS), PostgreSQL via `pg` pool, JWT auth.
  - Routes: auth, divisions, employees, tasks, crossAssignments, dailyLogs, reports, auditLogs.
  - Roles: `employee`, `supervisor`, `hr`, `admin`, `super_admin`.
  - JWT payload: `{ id, code, name, role, homeDivisionId }`.
  - Calc engine handles 3 task types: individual flat-rate, group flat-rate pool (split), group daily-limit/tiered (bonus on excess over target, split among participants).
  - Audit trail auto-flags retroactive edits (edits made after the original log date). `audit_logs.action` is enum CREATE/UPDATE/DELETE; `created_at` indexed.
  - Reports routes: `/daily`, `/monthly`, `/monthly/:employeeId`, `/employee-grid/:employeeId` (task×date grid), `/all-employee-grid` (task×date grid for ALL employees, incl. idle ones; merged name/code cell on client), `/monthly.csv`, `/daily.csv`, `/payslip.pdf` (PDF with task×date grid + a "Detailed daily breakdown" itemized table of Date/Task/Units/Rate/Earnings), `/my-earnings`, `/analytics` (rich: divisionTasks, divisionTrend, participationTrend, editsTrend, topEarner sparklines). `/daily`, `/monthly`, `/analytics`, `/all-employee-grid` accept `divisionId` query param. `ALLOWED_ROLES` for reports = admin/super_admin/hr/supervisor; `/analytics` still admin/super_admin.
  - Grid cell shape: every task×date cell in `/employee-grid/:id`, `/all-employee-grid` and `/payslip.pdf` gridRows carries `{ count, output, rate, amount }` where `rate` = `daily_task_logs.rate_snapshot` (last log for that day wins). Payslip `items` carry `{ date, task, unit, output, rate, amount }` with `date` as a clean `YYYY-MM-DD` string. **Day keys are 2-digit day-of-month strings (`"01"`..`"<lastDay>"`)** — the `dates` array AND `task.days` map are both keyed this way. Do NOT key by the raw `log_date`: `pg` returns DATE columns as JS Date objects, and `String(date).slice(0,10)` yields a locale string like `"Thu Aug 13"` that never matches → blank cells. Always normalize via the `dayKey(logDate)`/`isoDate(logDate)`/`monthDayKeys(month)` helpers at the top of `reports.js`. Frontend matrix columns render `{d}` directly (already `"01"`), NOT `d.slice(8)`. Frontend renders ONLY a green `✓` per cell; a body-level portal popover (`src/components/CellTooltip.jsx`) shows units / incentive rate / total earned on hover (avoids `overflow-x`/sticky-column clipping). CSS `.cell-pop` / `.cell-tip-host`. `.grid-breakdown` has `overflow-x:auto` (horizontal scroll) so wide 31-day matrices don't squash.
  - Employees routes: `GET /`, `POST /` (hr/admin/super_admin), `PUT /:id` (hr/admin/super_admin; super_admin-only `password` field resets it), `PATCH /:id/password` (super_admin-only), `DELETE /:id` (hr), `POST /bulk` (csv).
- **Cross-assignments (effective-from semantics):** `GET /api/cross-assignments` supports `date` (exact match) AND `effectiveOn` (returns assignments where `assignment_date <= effectiveOn`). The daily-log New Entry modal queries `?toDivisionId=X&effectiveOn=date` so cross-assigned staff show under their target division from the assignment date onward. The modal fetches its OWN cross-map on date/division change (independent of the page filter), so a supervisor picking any division sees the right cross-assigned employees. Cross-assigned employees are tagged with a red Badge "cross-assigned from <division>". Supervisors can log for ANY division (demo mode): the page division filter is unlocked for supervisors too.
- **Frontend** (`pussalla-frontend/`): Vite + React 19, react-router-dom v7.
  - API client: `src/api/client.js` (matches backend routes). `reportsApi` has `employeeGrid`, `allEmployeeGrid`, division-filtered `daily`/`monthly`/`analytics`. `employeesApi.setPassword(id,password)` = `PATCH /api/employees/:id/password`. `api.patch` exists.
  - Auth: `src/context/AuthContext.jsx`; Toasts: `src/context/ToastContext.jsx`.
  - Components: `src/components/` (Loaders, Modal, Card, Layout, ProtectedRoute, **Reveal**, **charts**). **Layout has NO topbar** — the "Incentivize / role" crumbs, "API Online" badge, and "{user.code}" badge were removed. Mobile sidebar toggle is a floating `.menu-fab` button (fixed top-left, `display:none` on desktop, shown ≤880px).
  - Pages: Login, Dashboard (role-aware), Earnings, DailyLogs, Tasks, Employees (super_admin can add users + set/reset passwords + assign super_admin role), CrossAssignments, Reports (monthly leaderboard + employee breakdown + all-employee work-breakdown grid with merged name/code cell, compact ✓ mode, **dedicated division filter defaulting to "All divisions"**; per-employee task×date grid; payslip PDF with count×amount), Audit, NotFound.
  - Theme (Incentivize branding): green/gold/cream palette in `src/styles/theme.css` (CSS vars still named `--pussalla-*` internally).
  - Custom loading animations in `src/components/Loaders.jsx`. `Logo` wordmark = "Incentivize".
  - Scroll-reveal: wrap sections in `<Reveal>` (IntersectionObserver, reduced-motion aware). Chart kit in `src/components/charts.jsx`: `VerticalBarChart`, `MultiLineChart`, `AreaChart`, `StackedColumnChart`, `Sparkline`, `CHART_PALETTE`.

## Key Conventions
- `Card.jsx` exports: default `Card`; named: `PageHead`, `KPI`, `EmptyState`, `Badge`, `SkeletonRows`.
  Import as `import Card, { PageHead, KPI, EmptyState, Badge, SkeletonRows } from "../components/Card"`.
- Route guard roles: `/earnings` -> `["employee","super_admin"]`; `/reports` -> hr/admin/super_admin/supervisor; admin pages -> supervisor/hr/admin/super_admin.

## Running Locally (verification)
- Backend DB: PostgreSQL. Create db `pussalla` with user `pussalla_app` / pass `change_me`.
  - `psql -U pussalla_app -d pussalla -f src/schema.sql` then `npm run seed`.
  - To flip an existing DB's passwords to `Incentivize@123` without re-seeding: `PASSWORD=Incentivize@123 npm run reset-passwords` (from `pussalla-backend`, reads `DATABASE_URL`).
  - Set `JWT_SECRET` in `pussalla-backend/.env` (from `.env.example`) before `npm start` (port 4000).
- Frontend: `cd pussalla-frontend && npm install && npm run dev` (port 5173, proxies `/api` -> :4000).
- Seed logins (all password `Incentivize@123`): EMP-001 super_admin, EMP-002 hr, EMP-003 admin, EMP-004 supervisor, EMP-009+ employees.

## Build
- `cd pussalla-frontend && npm run build` -> `dist/` (~327KB JS, ~28KB CSS). PASSING.
- The built frontend is committed inside `pussalla-backend/public/` (served by Express). After frontend changes, rebuild and copy `dist/` → `pussalla-backend/public/` (the `scripts/build-frontend.js` postinstall skips rebuild when both `public/` and `dist/` already exist, so delete `dist/` first to force a refresh).

## Constraints
- Backend source MAY be modified (prior "do not modify backend" constraint lifted for feature work), but keep changes minimal and consistent with existing patterns.
- No test framework configured; validate via `vite build` + logic smoke tests (grid/PDF shaping) + manual E2E.
