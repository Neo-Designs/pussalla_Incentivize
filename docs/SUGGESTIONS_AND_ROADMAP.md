# Incentivize — Suggestions & Improvements Roadmap

**Product:** Incentivize
**Document type:** Improvement backlog + phased future-implementation roadmap
**Audience:** Maintainers and product planners

> Every item below is a **recommendation**, not a description of current behavior. Where an item references the current state, that state is described explicitly (e.g., "JWT is currently stored in `sessionStorage`"). Nothing here is implemented unless it also appears in [`docs/PROJECT_REPORT.md`](./PROJECT_REPORT.md).

Priorities: **High** = address soon (risk or correctness), **Med** = meaningful value, **Low** = polish.

---

## 1. Security & Access Control

| # | Suggestion | Priority | Rationale |
|---|---|---|---|
| 1.1 | Move the JWT from `sessionStorage` to an **httpOnly cookie with refresh tokens** | High | Cookies are inaccessible to XSS-injected scripts; refresh tokens enable "remember me" without long-lived access tokens. (Current state: token lives in `sessionStorage`, cleared on tab close — noted in the README.) |
| 1.2 | Enable the commented-out `REVOKE UPDATE, DELETE ON audit_logs FROM pussalla_app` in production | High | Makes the audit trail immutable at the database level, not just by convention. The statement already exists in `src/schema.sql`, commented out. |
| 1.3 | Verify/tighten production CORS per deployment | High | Production already requires an explicit `CORS_ORIGIN` (no wildcard); each deployment should set it to exactly its own origin(s). |
| 1.4 | Extend rate limiting beyond the login endpoint | Med | Only `/api/auth/login` is limited today (30/15 min/IP); write-heavy endpoints (daily logs, bulk import) are unthrottled. |
| 1.5 | Force password change on first login for seeded/bulk-imported accounts | Med | All demo/seeded accounts share one known password (`Incentivize@123`); bulk-imported accounts likewise start from a shared credential. |

## 2. Testing & Quality

| # | Suggestion | Priority | Rationale |
|---|---|---|---|
| 2.1 | Introduce a test framework (none is currently configured) | High | Verification today is manual E2E + build checks only. |
| 2.2 | Unit-test `calcEngine` — all three formulas, including the zero-participant edge | High | Payout math is the financial core of the product and currently has no executable specification. |
| 2.3 | API integration tests for report grid day-key normalization | High | Grid endpoints key cells by 2-digit day-of-month because `pg` returns DATE columns as JS Date objects; a regression here silently blanks every grid cell. |
| 2.4 | E2E smoke test: login → create log → view report | Med | Covers the highest-value user journey across the stack. |
| 2.5 | CI pipeline running build + tests on every commit | Med | `vite build` is the only automated check today, and it runs manually. |

## 3. Product Features

| # | Suggestion | Priority | Rationale |
|---|---|---|---|
| 3.1 | Payout approval workflow (supervisor submits → HR approves before payroll) | High | Logs currently flow straight into payout totals; an approval gate would catch errors before money moves. |
| 3.2 | Attendance/leave integration affecting participant check-off | Med | Group-task splits assume checked-off participants were present; linking attendance removes manual reconciliation. |
| 3.3 | Email/notification when a payslip is available | Med | Employees must currently check the app proactively. |
| 3.4 | Configurable pay periods (weekly/biweekly) beyond monthly | Med | Reports are month-oriented today; some customers pay on other cycles. |
| 3.5 | Target/benchmark tracking per task | Low | Type-3 tasks have a daily base limit; extending targets to types 1–2 enables performance-vs-goal reporting. |
| 3.6 | Employee dispute/query channel on earnings | Low | A structured in-app channel would reduce ad-hoc payout disputes. |

## 4. Reports & Analytics Enhancements

| # | Suggestion | Priority | Rationale |
|---|---|---|---|
| 4.1 | Scheduled report emails | Med | Management currently has to open the dashboard; scheduled digests keep payouts visible. |
| 4.2 | Excel (.xlsx) export alongside CSV | Med | CSV exists (`monthly.csv`, `daily.csv`); many finance teams standardize on Excel. |
| 4.3 | Arbitrary date-range analytics (not just month-scoped) | Med | `/analytics` and grids are month-keyed today. |
| 4.4 | Division comparison view | Low | Per-division totals exist; a side-by-side comparison would aid benchmarking. |
| 4.5 | Export the all-employee grid to CSV/PDF | Low | The grid is screen-only today. |
| 4.6 | Caching for heavy grid queries | Low | `all-employee-grid` scans a full month across all employees; caching helps as data grows. |

## 5. UX Improvements

| # | Suggestion | Priority | Rationale |
|---|---|---|---|
| 5.1 | Saved filter presets on the Reports page | Low | Users repeatedly re-enter the same month/division filters. |
| 5.2 | Keyboard-accessible grid tooltips | Med | Grid cell details (units/rate/earnings) are hover-only (`CellTooltip`); keyboard and touch users can't reach them. |
| 5.3 | Printable payslip CSS for the on-screen `PayslipView` | Low | The PDF exists, but printing the on-screen view is unstyled. |
| 5.4 | Dark mode | Low | The theme is token-driven (`--pussalla-*` CSS vars), so a dark palette is cheap to add. |
| 5.5 | Localization | Low | UI copy is English-only. |

## 6. Technical Improvements

| # | Suggestion | Priority | Rationale |
|---|---|---|---|
| 6.1 | Pagination on grid endpoints for very large teams | Med | List endpoints are paginated (`{rows, page, limit, total}`), but the month-wide grids return everything at once. |
| 6.2 | Consolidate request validation | Med | Validation exists in middleware but is applied per-route; a shared schema layer would reduce drift. |
| 6.3 | TypeScript migration path | Low | Both packages are plain JS; types would harden the API client/route contract. |
| 6.4 | Versioned DB migration tooling | Med | Today the schema is applied manually (`schema.sql`) plus one migration file (`001_scale_and_tenants.sql`); a migration runner would make upgrades repeatable. |
| 6.5 | API versioning (`/api/v1`) | Low | The API is unversioned; versioning eases future breaking changes. |

## 7. Operations

| # | Suggestion | Priority | Rationale |
|---|---|---|---|
| 7.1 | Automated DB backups with retention policy | High | No backup automation is defined in the repo; payout data is financially sensitive. |
| 7.2 | Structured logging | Med | Request logging is Morgan's `dev` format; JSON logs would enable aggregation and alerting. |
| 7.3 | Monitoring & alerting | Med | Only `/api/health` exists; no metrics or uptime alerting. |
| 7.4 | Secrets-management guidance | Med | `JWT_SECRET`/`DATABASE_URL` live in `.env`; document a secrets store for production deployments. |

## 8. Phased Roadmap

### Phase A — Quick wins & safety (short term)

- 2.1–2.3: test framework + `calcEngine` unit tests + grid day-key integration tests
- 2.5: CI pipeline (build + tests)
- 1.1: httpOnly-cookie auth with refresh tokens
- 1.2: enable the `audit_logs` REVOKE hardening in production
- 7.1: automated DB backups

*Theme: protect the money math and the audit trail before adding features.*

### Phase B — Workflow & reporting depth (mid term)

- 3.1: payout approval workflow (supervisor → HR)
- 3.2: attendance/leave integration for participant check-off
- 4.1–4.3: scheduled report emails, .xlsx exports, date-range analytics
- 1.4–1.5: broader rate limiting, forced first-login password change
- 6.4: versioned DB migration tooling
- 5.2: keyboard-accessible grid tooltips

*Theme: turn raw logging into a controlled payroll pipeline.*

### Phase C — Scale & reach (long term)

- Multi-company activation: move from per-customer databases to in-app tenancy on the existing `companies`/`company_id` foundation
- 4.4–4.6, 6.1: division comparison, grid exports, caching/pagination for very large teams
- 3.3–3.6: notifications, configurable pay periods, targets, dispute channel
- 6.3, 6.5, 7.2–7.4: TypeScript path, API versioning, structured logging, monitoring, secrets guidance
- Mobile/PWA experience for floor use

*Theme: grow from single-tenant deployment to a multi-customer, multi-device product.*

---

*Related documents: [`docs/PROJECT_PROPOSAL.md`](./PROJECT_PROPOSAL.md), [`docs/PROJECT_REPORT.md`](./PROJECT_REPORT.md).*
