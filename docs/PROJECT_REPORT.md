# Incentivize — Project Report (As-Built)

**Product:** Incentivize (rebranded from "Pussalla Incentive System")
**Document type:** As-built / final project report
**Audience:** Operators, auditors, and maintainers

> Branding note: user-facing branding is **Incentivize**. Directory, package, and database names (`pussalla-backend`, `pussalla-frontend`, `pussalla_app`, `pussalla`) remain as technical identifiers.

---

## 1. Project Summary & Status

Incentivize is a delivered, working full-stack platform for incentive-salary and division task management. It tracks daily worker output across divisions, computes incentive payouts with three calculation engines, produces a complete suite of reports/exports/payslips plus an analytics dashboard, and keeps a tamper-evident audit trail that flags retroactive edits.

**Status: delivered.** All phases in the [proposal](./PROJECT_PROPOSAL.md) are implemented and verified (see §8). To run the system locally or deploy it, follow the quick-start in the root [`README.md`](../README.md) and [`docs/RENDER_DEPLOY.md`](./RENDER_DEPLOY.md).

## 2. System Architecture (As Built)

### Backend (`pussalla-backend/` — Express 5, CommonJS)

- **Entry/middleware:** `src/app.js` mounts Helmet, CORS (dev wildcard / production `CORS_ORIGIN`), JSON + CSV body parsers, Morgan logging, and a login rate limiter (30 attempts / 15 min / IP). It also serves the built frontend from `pussalla-backend/public/` (single origin, SPA fallback for non-`/api` GETs).
- **Routes** (all under `/api`):

| Mount | Module | Purpose |
|---|---|---|
| `/api/auth` | `routes/auth.js` | Login (rate-limited), current-user profile |
| `/api/divisions` | `routes/divisions.js` | Division listing |
| `/api/employees` | `routes/employees.js` | Employee CRUD, password reset, `/bulk` CSV import |
| `/api/tasks` | `routes/tasks.js` | Task catalogue CRUD (type, rate, base limit, unit) |
| `/api/cross-assignments` | `routes/crossAssignments.js` | Temporary cross-division staffing |
| `/api/daily-logs` | `routes/dailyLogs.js` | Daily task logs (all 3 engines), participants |
| `/api/reports` | `routes/reports.js` | Reports, grids, exports, payslips, analytics (§4) |
| `/api/audit-logs` | `routes/auditLogs.js` | Paginated audit trail, `flagged=true` filter |

- **Utilities:** `src/utils/calcEngine.js` (payout math), `src/utils/exporters.js` (CSV/PDF), `src/utils/audit.js` (audit helper), `src/utils/pagination.js` (`{rows, page, limit, total}` list responses).
- **Middleware:** JWT auth + role gating (`middleware/auth.js`), audit logging, request validation.
- **Database:** PostgreSQL via a `pg` pool (`src/db.js`); schema in `src/schema.sql` plus migration `src/migrations/001_scale_and_tenants.sql` (composite indexes + `companies` multi-tenant table).

### Frontend (`pussalla-frontend/` — React 19 + Vite 8)

- **Pages:** Login, Dashboard (role-aware), Earnings (`/earnings`), DailyLogs (`/daily-logs`), Tasks (`/tasks`), Employees (`/employees`), CrossAssignments (`/cross-assignments`), Reports (`/reports`), Audit (`/audit`), NotFound.
- **Key components:** `Layout` (sidebar, mobile `.menu-fab`), `Card` (plus `PageHead`, `KPI`, `EmptyState`, `Badge`, `SkeletonRows`), `Modal`, `Loaders`, `Reveal` (scroll-reveal), `CellTooltip` (grid hover popover), `PayslipView` (on-screen payslip), and a hand-rolled SVG chart kit (`charts.jsx`).
- **Support modules:** `src/api/client.js` (typed API client matching every backend route), `AuthContext` (JWT session), `ToastContext` (notifications), `src/styles/theme.css` (brand tokens).

## 3. Functions by User Role

The system implements five roles (`user_role` enum). Access is enforced twice: by frontend route guards in `src/App.jsx` and by backend `requireRole(...)` middleware. The `super_admin` bypasses navigation gating and can reach every page.

### 3.1 `employee`

- **Dashboard** — personal KPIs and recent activity.
- **My Earnings** (`/earnings`) — own payout history, per-task breakdown, and payslip:
  - View the on-screen payslip (`PayslipView`).
  - Download own payslip PDF (`/api/reports/payslip.pdf` scoped to the caller).

### 3.2 `supervisor`

- **Dashboard.**
- **Daily Logs** (`/daily-logs`) — the operational heart of the role:
  - Create, edit, and delete daily logs for all three task types.
  - Live calculation preview before saving (same `calcEngine` math as the backend).
  - Participant check-off for group tasks (types 2 and 3).
  - Division filter — in demo mode supervisors may log for **any** division.
  - Cross-assigned employees are surfaced in the New Entry modal (queried with `effectiveOn`, so they appear from their assignment date onward) and tagged with a red "cross-assigned from ‹division›" badge.
- **Reports** (`/reports`) — view leaderboards, grids, and breakdowns; no employee or task administration.

### 3.3 `hr`

- **Dashboard.**
- **Employees** (`/employees`) — create and update employee records; delete employees (`DELETE /api/employees/:id` is HR-only); bulk-import employees from CSV (`POST /api/employees/bulk`, shared with admin) with row-by-row error reporting.
- **Cross-Assignments** (`/cross-assignments`) — schedule and manage temporary division moves.
- **Reports** (`/reports`) — full access.

### 3.4 `admin`

- **Dashboard**, including the **Analytics** dashboard (shared with `super_admin`).
- **Tasks** (`/tasks`) — task CRUD: name, type (1/2/3), rate, base limit (type 3), unit.
- **Employees** (`/employees`) — create and update employee records; bulk CSV import.
- **Reports** (`/reports`) — full access.

### 3.5 `super_admin`

Everything above, plus exclusive capabilities:

- Set/reset any user's password (`PATCH /api/employees/:id/password`, super-admin-only).
- Assign roles, including `super_admin`.
- **Audit Trail** (`/audit`) — review the immutable log, with retroactive edits automatically flagged.
- **Analytics** dashboard.
- **My Earnings** view.

### 3.6 Role × Page Access Matrix

From `src/App.jsx` route guards (plus the `super_admin` bypass):

| Page (path) | employee | supervisor | hr | admin | super_admin |
|---|:-:|:-:|:-:|:-:|:-:|
| Dashboard (`/`) | ✓ | ✓ | ✓ | ✓ | ✓ |
| My Earnings (`/earnings`) | ✓ | — | — | — | ✓ |
| Daily Logs (`/daily-logs`) | — | ✓ | — | — | ✓* |
| Tasks (`/tasks`) | — | — | — | ✓ | ✓* |
| Employees (`/employees`) | — | — | ✓ | ✓ | ✓* |
| Cross-Assignments (`/cross-assignments`) | — | — | ✓ | — | ✓* |
| Reports (`/reports`) | — | ✓ | ✓ | ✓ | ✓ |
| Audit (`/audit`) | — | — | — | — | ✓ |

\* via the `super_admin` nav bypass.

Backend enforcement highlights:

- Reports API `ALLOWED_ROLES` = `admin`, `super_admin`, `hr`, `supervisor` (`src/routes/reports.js`); `/analytics` is further restricted to `admin`/`super_admin`; `/payslip.pdf` and `/my-earnings` only require authentication (scoped to the caller).
- Employees API: create/update = `hr`/`admin`/`super_admin`; password reset = `super_admin`; delete = `hr`; bulk import = `hr`/`admin`.

## 4. Reports & Analytics Catalog

All endpoints are under `/api/reports`. Month-scoped endpoints take a `month` query parameter (`YYYY-MM`); `/my-earnings` and `/analytics` take `from`/`to` date ranges; several also accept `divisionId` (noted per endpoint). The Reports UI surfaces them with the hand-rolled SVG chart kit.

### 4.1 Daily payout report — `GET /daily`, `GET /daily.csv`

Per-employee tasks completed for a given date, daily total per employee, and a grand total. Accepts `divisionId`. CSV export available (`daily.csv`).

### 4.2 Monthly payout report — `GET /monthly`, `GET /monthly.csv`

Server-side per-employee monthly totals with days logged, task-log counts, and per-task items, ordered as a leaderboard (top earners first). Accepts `divisionId`. CSV export available (`monthly.csv`).

### 4.3 Employee drill-down — `GET /monthly/:employeeId`

Itemized list of one employee's logs for the month plus per-task breakdown totals.

### 4.4 Per-employee task×date grid — `GET /employee-grid/:employeeId`

A task(rows) × day-of-month(columns) matrix for one employee. Every cell carries `{count, output, rate, amount}` where `rate` is the log-day's `rate_snapshot`. Day keys are 2-digit strings (`"01"`…`"31"`); the UI renders a compact green `✓` per worked day and shows units / incentive rate / total earned in a hover tooltip (`CellTooltip`).

### 4.5 All-employee grid — `GET /all-employee-grid`

The same task×date grid for **all** employees, including idle ones with no logs, with a merged name/code cell per employee. Accepts `divisionId`. This powers the "all-employee work-breakdown" view on the Reports page.

### 4.6 Payslip PDF — `GET /payslip.pdf`

A generated PDF (pdfkit) containing:

- bordered employee metadata,
- the monthly task×date activity grid,
- a "Detailed daily breakdown" itemized table (Date / Task / Units / Rate / Earnings),
- the highlighted total incentive payout.

The on-screen `PayslipView` component renders the same data in-app. Employees may fetch only their own payslip.

### 4.7 Self-service earnings — `GET /my-earnings`

Earnings for the authenticated caller over a `from`/`to` date range, scoped to their own logs, with itemized rows, per-task breakdown, and grand total; backs the Earnings page.

### 4.8 Analytics — `GET /analytics` (admin / super_admin)

Rich dashboard payload:

- **KPIs:** total logs, total payout, total output, active employees, active tasks, division count, flagged edits.
- **Per-division payout totals** and **per-division task drill-down** (`divisionTasks`).
- **Top earners**, each with a daily sparkline series.
- **Trends:** daily payout trend, per-division trend, participation trend, and edit-activity trend (from the audit trail).

Accepts `divisionId`. Visualized with `VerticalBarChart`, `MultiLineChart`, `AreaChart`, `StackedColumnChart`, and `Sparkline`.

### 4.9 Frontend visualization surfaces

| Surface | Location | Backing endpoint(s) |
|---|---|---|
| Role-aware dashboard KPIs & charts | `/` | `/analytics` (admin/super_admin), role-scoped data |
| Monthly leaderboard + employee breakdown + all-employee grid | `/reports` | `/monthly`, `/monthly/:id`, `/all-employee-grid` |
| Per-employee task×date grid + payslip view/download | `/reports` | `/employee-grid/:id`, `/payslip.pdf` |
| My earnings + own payslip | `/earnings` | `/my-earnings`, `/payslip.pdf` |
| CSV exports | `/reports` | `/monthly.csv`, `/daily.csv` |

## 5. Incentive Calculation Engines

All payout math lives in `src/utils/calcEngine.js` and operates on the log's snapshotted rate/base limit:

| Type | Name | Formula | Worked example |
|---|---|---|---|
| 1 | Individual Flat Rate | `output × rate` | 120 units @ 5.00 → **600.00** for the worker |
| 2 | Group Flat-Rate Pool | `(output × rate) ÷ participants` | 300 units @ 2.00 = 600.00, split 4 ways → **150.00** each |
| 3 | Group Daily Limit / Tiered | `max(0, output − base_limit) × rate ÷ participants` | base 1,000; output 1,400 @ 3.00 → excess 400 × 3.00 = 1,200.00, split 5 ways → **240.00** each |

Edge behavior: if a group log has zero checked-off participants, `perWorker` is `0` (no division by zero).

**Snapshot semantics:** every `daily_task_logs` row stores `rate_snapshot` and `base_limit_snapshot` captured at log time. Later edits to the task's rate or base limit affect only future logs; historical payouts and grid cells always show the frozen values.

## 6. Cross-Assignment Handling

- HR schedules temporary division moves in `cross_assignments` with an `assignment_date`.
- **Effective-from semantics:** the daily-log New Entry modal queries `GET /api/cross-assignments?toDivisionId=X&effectiveOn=date`, which returns assignments where `assignment_date <= effectiveOn` — so cross-assigned staff appear under their target division from the assignment date onward (and not before).
- The modal fetches its own cross-map whenever the date or division changes, independent of the page filter, so a supervisor picking any division sees the correct cross-assigned employees, tagged with a red "cross-assigned from ‹division›" badge.

## 7. Audit & Integrity

- Every create/update/delete on core entities writes an `audit_logs` row: action (`CREATE`/`UPDATE`/`DELETE` enum), actor, division, and JSONB old/new row snapshots.
- The table is designed to be **immutable** — the schema ships a commented-out `REVOKE UPDATE, DELETE ON audit_logs` hardening statement for production use; `created_at` is indexed.
- **Retroactive edits are flagged automatically:** edits made after the original log date are marked so the super-admin can review them on the Audit page (`/api/audit-logs?flagged=true`).
- The Analytics dashboard surfaces flagged-edit counts and an edit-activity trend, giving management continuous visibility into data hygiene.

## 8. Verification Status

Validated end-to-end against a live PostgreSQL + backend instance (per the README verification record):

- ✅ Login + JWT persistence across all roles.
- ✅ Role-gated navigation (e.g., an employee sees only Dashboard + Earnings).
- ✅ Daily logs for all 3 task types render with correct math; creation modal works.
- ✅ Audit trail — retroactive edits auto-flagged and surfaced for super admin.
- ✅ Reports — monthly top earners and CSV export.
- ✅ Production build passes (`vite build`).

**Honest limitation:** no automated test framework is configured in either package; verification is manual E2E plus build checks. Introducing automated tests is a top recommendation in [`docs/SUGGESTIONS_AND_ROADMAP.md`](./SUGGESTIONS_AND_ROADMAP.md).

---

*Related documents: [`docs/PROJECT_PROPOSAL.md`](./PROJECT_PROPOSAL.md), [`docs/SUGGESTIONS_AND_ROADMAP.md`](./SUGGESTIONS_AND_ROADMAP.md), [`README.md`](../README.md).*
