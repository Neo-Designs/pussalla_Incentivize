# Pussalla Incentive Salary & Task Management — Frontend

React (Vite) single-page application that consumes the Express + PostgreSQL
backend in [`../pussalla-backend`](../pussalla-backend). It implements the
full Pussalla brand identity, custom loading animations, and a complete
role-based UI for every endpoint the backend exposes.

## Roles & features

| Role | What they can do |
|------|------------------|
| **Employee** | View today's payout + personal earnings history (derived from `task_participants`). Export CSV. |
| **Supervisor** | Create / edit / delete daily task logs using all three calculation engines (Type 1 individual, Type 2 pool, Type 3 tiered) with a live payout preview. |
| **HR** | Employee CRUD, cross-division temporary reassignments, view daily & monthly reports. |
| **Admin** | Task definition CRUD (rate, engine, base limit), plus everything HR can do except delete employees. |
| **Super Admin** | Everything, plus the read-only immutable audit trail with the retroactive-edit flag filter. |

`super_admin` passes every role gate on the frontend, mirroring the
backend's `requireRole(...)` behaviour.

## Getting started

```bash
cd pussalla-frontend
npm install
npm run dev      # http://localhost:5173 (proxies /api -> http://localhost:4000)
```

Make sure the backend is running first (see the backend README). In dev,
Vite proxies `/api/*` to `http://localhost:4000` (override with
`VITE_API_URL`). For production, `npm run build` emits a static bundle in
`dist/` that can be served by the backend or any static host pointed at the
same API origin.

### Demo logins

Every seeded account shares the password `Incentivize@123`:

| Role | Code |
|------|------|
| Super Admin | `EMP-001` |
| HR | `EMP-002` |
| Admin | `EMP-003` |
| Supervisor (Processing Plant A) | `EMP-004` |

## Branding

- **Primary** — deep poultry-green (`#1b5e20` / `#2e7d32`)
- **Accent** — harvest gold / amber (`#ffb300` / `#d4a017`)
- **Surfaces** — warm cream canvas, white cards, soft sage tints
- **Custom loading animations** — concentric dual-ring spinner, bobbing egg
  loader (on-brand for a poultry company), indeterminate shimmer bar, and
  skeleton rows; all defined in `src/styles/theme.css` and respect
  `prefers-reduced-motion`.

## Architecture

```
pussalla-frontend/
  index.html
  vite.config.js
  src/
    main.jsx              # entry: Router + AuthProvider + ToastProvider
    App.jsx               # routes + role-gated <RequireAuth> wrappers
    styles/theme.css      # pussalla brand palette + loading animations
    styles/app.css        # app shell / layout / modal / toast styles
    api/client.js         # fetch wrapper (JWT) + per-resource API modules
    utils/helpers.js      # formatters, role helpers, calc-engine mirror
    context/
      AuthContext.jsx     # login/logout, /me bootstrap, backend ping
      ToastContext.jsx    # toast notifications
    components/
      Layout.jsx          # sidebar + topbar (role-aware nav)
      ProtectedRoute.jsx  # <RequireAuth roles=[...]>
      Modal.jsx           # Modal + ConfirmDialog
      Card.jsx            # Card, KPI, PageHead, EmptyState, Badge, skeletons
      Loaders.jsx         # Logo, Spinner, EggLoader, FullScreenLoader
    pages/
      LoginPage.jsx
      DashboardPage.jsx   # role-aware KPIs + widgets
      EarningsPage.jsx
      DailyLogsPage.jsx   # 3-engine create/edit with live preview
      TasksPage.jsx
      EmployeesPage.jsx
      CrossAssignmentsPage.jsx
      ReportsPage.jsx     # daily/monthly + CSV export
      AuditPage.jsx       # super_admin immutable trail
      NotFoundPage.jsx
```

The backend is the source of truth for all calculations; the frontend's
`calcEngine` mirror in `utils/helpers.js` is only used for the live preview
shown to supervisors before they submit a log.
