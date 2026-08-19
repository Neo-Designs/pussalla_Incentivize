# Incentivize — Project Proposal

**Product:** Incentivize (rebranded from "Pussalla Incentive System")
**Document type:** Forward-looking project proposal
**Audience:** Stakeholders and decision-makers

> Note: Directory, package, and database names (`pussalla-backend`, `pussalla-frontend`, `pussalla_app`, `pussalla`) are retained as technical identifiers for stability. All user-facing branding is **Incentivize**.

---

## 1. Executive Summary

Incentivize is a full-stack incentive-salary and division task-management platform. It captures daily worker output across five divisions, calculates per-worker incentive payouts with three purpose-built calculation engines (individual flat-rate, group flat-rate pool, group daily-limit/tiered bonus), and records every change in a tamper-evident audit trail that automatically flags retroactive edits. The platform ships as a single-origin deployment: an Express API that also serves the built React frontend, backed by PostgreSQL.

## 2. Problem Statement

Piece-rate and incentive pay on a production floor is hard to run fairly and transparently:

- **Manual tracking** of daily output across multiple divisions is error-prone and slow.
- **Group work** complicates payout math: pool-based tasks must be split among the workers who actually participated, and target-based tasks only pay a bonus on output *above* a daily threshold.
- **Cross-division staffing** — workers temporarily assigned to another division — is easily lost in spreadsheets, so output gets credited to the wrong place.
- **Payout opacity** breeds disputes: workers cannot see how their pay was computed.
- **Fraud risk from retroactive edits**: logs changed after the fact can silently alter payouts unless the system keeps an immutable record of who changed what, and when.

## 3. Objectives & Success Criteria

| Objective | Success criterion |
|---|---|
| Accurate per-worker payout math | All three task types compute correctly, including group splits and zero-participant edge cases |
| Role-based accountability | Five distinct roles with least-privilege access, enforced in both the UI and the API |
| Self-service earnings | Every employee can view their own payout history, per-task breakdown, and payslip |
| Auditability | Every create/update/delete is recorded with actor and JSONB before/after snapshots; retroactive edits are automatically flagged |
| Operational simplicity | One-command deployment (Docker / Render Blueprint) serving UI + API from a single origin |

## 4. Scope

### In scope

- Five user roles: `employee`, `supervisor`, `hr`, `admin`, `super_admin`
- Daily task logs for all three calculation engines, with live calculation preview and participant check-off
- Cross-division assignments with effective-from semantics
- Reports: daily and monthly payout reports, per-employee drill-down, task×date grids, leaderboard, CSV exports, PDF payslips
- Analytics dashboard (KPIs, per-division totals, trends, top earners, edit activity)
- Immutable audit trail with automatic retroactive-edit flagging
- Bulk employee import via CSV

### Out of scope

The following are explicitly **excluded** from this proposal (not deferred future work):

- Payroll / bank integration (the system computes incentive payouts; disbursement is external)
- Attendance and leave management
- Native mobile application (the web UI is the only client)

## 5. Stakeholders & Roles

The system models five roles (the `user_role` enum in `src/schema.sql`):

| Role | Persona | Primary concerns |
|---|---|---|
| `employee` | Floor worker | "What did I earn, and why?" — self-service earnings and payslip |
| `supervisor` | Division supervisor | Capture daily output accurately for their teams, including cross-assigned staff |
| `hr` | Human resources | Employee records, onboarding (incl. bulk CSV import), cross-division assignments |
| `admin` | Operations administrator | Task catalogue (types, rates, base limits), employee records, analytics |
| `super_admin` | System owner | Everything, plus password resets, role assignment, audit-trail review |

## 6. Full Tech Stack

All versions below are verified against the repository's `package.json` files.

### Frontend (`pussalla-frontend/`)

| Component | Version | Notes |
|---|---|---|
| React | ^19.2.8 | With `react-dom` ^19.2.8 |
| react-router-dom | ^7.18.2 | Client-side routing with role guards |
| Vite | ^8.2.1 | Build tool / dev server |
| @vitejs/plugin-react | ^6.0.5 | React plugin for Vite |
| UI library | — | **None.** Hand-crafted CSS (`src/styles/theme.css`, `--pussalla-*` tokens) |
| Charts | — | Hand-rolled SVG chart kit (`src/components/charts.jsx`) — no chart library |

### Backend (`pussalla-backend/`)

| Component | Version | Purpose |
|---|---|---|
| Node.js | 18+ | Runtime (CommonJS) |
| Express | ^5.2.1 | HTTP framework |
| pg | ^8.23.0 | PostgreSQL connection pool |
| jsonwebtoken | ^9.0.3 | JWT issuance/verification |
| bcryptjs | ^3.0.3 | Password hashing |
| helmet | ^8.3.0 | Security headers |
| cors | ^2.8.6 | CORS policy |
| morgan | ^1.11.0 | Request logging |
| express-rate-limit | ^8.6.2 | Login rate limiting |
| csv-parse | ^7.0.2 | Bulk employee CSV import |
| pdfkit | ^0.19.1 | Payslip PDF generation |
| dotenv | ^17.4.2 | Environment configuration |
| nodemon (dev) | ^3.1.14 | Dev auto-reload |

### Database

- **PostgreSQL 14+**, schema in `pussalla-backend/src/schema.sql` plus versioned migration `src/migrations/001_scale_and_tenants.sql`.
- Entities: `divisions`, `employees`, `tasks`, `cross_assignments`, `daily_task_logs`, `task_participants`, `audit_logs` (immutable, JSONB snapshots), `companies` (multi-tenant-ready).
- Enums: `user_role` (five roles), `audit_action` (`CREATE`/`UPDATE`/`DELETE`); composite indexes for scale.
- Each daily log stores `rate_snapshot` / `base_limit_snapshot` so historical payouts are immune to later rate changes.

### Auth & Security

- JWT authentication (payload `{id, code, name, role, homeDivisionId}`), token stored in `sessionStorage`.
- bcrypt password hashing; role-gating middleware (`requireAuth`, `requireRole`).
- Helmet security headers; CORS policy (wildcard in development, explicit `CORS_ORIGIN` required in production).
- Login rate limiting (30 attempts per IP per 15 minutes).
- Immutable `audit_logs` table (schema includes a commented-out `REVOKE UPDATE, DELETE` hardening statement).

### Deployment

- **Docker:** multi-stage root `Dockerfile` (builds frontend, runs backend); `docker-compose.prod.yml` for a one-command app + Postgres stack.
- **Render:** `render.yaml` Blueprint (see `docs/RENDER_DEPLOY.md`).
- **Single origin:** Express serves the committed built frontend from `pussalla-backend/public/`, so UI and API share an origin with no separate static host.

## 7. System Architecture

```
React SPA (Vite build)  ──►  Express REST API (/api/*)  ──►  PostgreSQL
     │                            │
     │                            ├── middleware: auth, role-gating, audit, validation
     │                            ├── routes: auth, divisions, employees, tasks,
     │                            │           crossAssignments, dailyLogs, reports, auditLogs
     │                            └── utils: calcEngine, exporters (CSV/PDF), audit, pagination
     └── served statically by Express from pussalla-backend/public/ (single origin)
```

Key design decisions:

- **Calculation engine placement** — all payout math lives in one pure function, `src/utils/calcEngine.js`, shared by every code path that reads or writes logs, so preview and persisted payout can never diverge.
- **Rate/base-limit snapshots** — each `daily_task_logs` row freezes the rate and base limit at log time; mid-month rate changes never rewrite history.
- **Audit JSONB snapshots** — every mutation writes old/new row snapshots to `audit_logs`, giving a replayable, tamper-evident history.
- **Multi-tenant readiness** — a `companies` table holds tenant identity and every core table carries `company_id`; today each customer runs an isolated database (see `docs/CUSTOMER_DATABASE_SETUP.md`).

## 8. Proposed Deliverables & Phases

| Phase | Deliverables | Status |
|---|---|---|
| **Phase 1 — Core logging & calculations** | Schema, auth with five roles, daily logs for all 3 calc engines, participant check-off, live calculation preview | ✅ Delivered |
| **Phase 2 — Reports, exports & payslips** | Daily/monthly payout reports, employee drill-down, task×date grids, CSV exports, PDF payslips, self-service earnings | ✅ Delivered |
| **Phase 3 — Analytics & audit** | Analytics dashboard (KPIs, trends, top earners), immutable audit trail with retroactive-edit flagging, audit review page | ✅ Delivered |
| **Phase 4 — Hardening & scale** | Composite indexes, `companies` multi-tenant table, login rate limiting, production CORS gating, Docker/Render deployment, bulk CSV import | ✅ Delivered |

The delivered state of each phase is documented in [`docs/PROJECT_REPORT.md`](./PROJECT_REPORT.md); candidate next steps live in [`docs/SUGGESTIONS_AND_ROADMAP.md`](./SUGGESTIONS_AND_ROADMAP.md).

## 9. Risks & Mitigations

| Risk | Mitigation (as built) |
|---|---|
| Data-entry errors alter payouts | Immutable audit trail; retroactive edits automatically flagged for super-admin review |
| Rate changes mid-month corrupt history | `rate_snapshot` / `base_limit_snapshot` frozen on every log row |
| Brute-force login on the public deployment | Login rate limiting (30 attempts / 15 min per IP); bcrypt hashing |
| Scale (thousands of logs/employees) | Composite indexes; paginated list endpoints returning `{rows, page, limit, total}` |
| Serving multiple customers | Isolated PostgreSQL database per customer; `companies` table + `company_id` columns for future in-app tenancy |

---

*Related documents: [`docs/PROJECT_REPORT.md`](./PROJECT_REPORT.md) (as-built report), [`docs/SUGGESTIONS_AND_ROADMAP.md`](./SUGGESTIONS_AND_ROADMAP.md) (improvements & roadmap), [`README.md`](../README.md) (quick start).*
