-- ============================================================
-- Incentivize — Incentive Salary Pussalla Incentive Salary & Division Task Management System Division Task Management System
-- PostgreSQL schema
-- Run with: psql -U <user> -d pussalla -f src/schema.sql
-- ============================================================

CREATE TYPE user_role AS ENUM ('employee', 'supervisor', 'hr', 'admin', 'super_admin');
CREATE TYPE audit_action AS ENUM ('CREATE', 'UPDATE', 'DELETE');

-- ---------------------------------------------------------
-- Divisions
-- ---------------------------------------------------------
CREATE TABLE divisions (
  id           SERIAL PRIMARY KEY,
  code         VARCHAR(10) UNIQUE NOT NULL,
  name         VARCHAR(120) NOT NULL,
  description  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------
-- Employees (also serves as the login/user table)
-- ---------------------------------------------------------
CREATE TABLE employees (
  id                SERIAL PRIMARY KEY,
  code              VARCHAR(20) UNIQUE NOT NULL,
  name              VARCHAR(150) NOT NULL,
  home_division_id  INTEGER REFERENCES divisions(id) ON DELETE SET NULL,
  role              user_role NOT NULL DEFAULT 'employee',
  password_hash     TEXT NOT NULL,
  active            BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_employees_home_division ON employees(home_division_id);
CREATE INDEX idx_employees_role ON employees(role);

-- ---------------------------------------------------------
-- Tasks (locked to a division, one of three calculation engines)
--   task_type 1 = Individual Flat Rate      -> output * rate
--   task_type 2 = Group Flat Rate Pool      -> (total_output * rate) / checked_off_workers
--   task_type 3 = Group Daily Limit/Tiered  -> max(0, total_output - base_limit) * rate / checked_off_workers
-- ---------------------------------------------------------
CREATE TABLE tasks (
  id           SERIAL PRIMARY KEY,
  code         VARCHAR(50) UNIQUE,
  division_id  INTEGER NOT NULL REFERENCES divisions(id) ON DELETE CASCADE,
  name         VARCHAR(150) NOT NULL,
  task_type    SMALLINT NOT NULL CHECK (task_type IN (1, 2, 3)),
  rate         NUMERIC(12,2) NOT NULL CHECK (rate >= 0),
  base_limit   NUMERIC(12,2) CHECK (base_limit IS NULL OR base_limit >= 0),
  unit         VARCHAR(30) NOT NULL,
  active       BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT base_limit_requires_type3 CHECK (
    (task_type = 3 AND base_limit IS NOT NULL) OR (task_type <> 3)
  )
);

CREATE INDEX idx_tasks_division ON tasks(division_id);

-- ---------------------------------------------------------
-- Cross-division temporary reassignments (managed by HR)
-- ---------------------------------------------------------
CREATE TABLE cross_assignments (
  id                SERIAL PRIMARY KEY,
  employee_id       INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  from_division_id  INTEGER NOT NULL REFERENCES divisions(id),
  to_division_id    INTEGER NOT NULL REFERENCES divisions(id),
  assignment_date   DATE NOT NULL,
  shift             VARCHAR(20) NOT NULL,
  note              TEXT,
  created_by        INTEGER REFERENCES employees(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cross_assignments_date ON cross_assignments(assignment_date);
CREATE INDEX idx_cross_assignments_to_division ON cross_assignments(to_division_id);

-- ---------------------------------------------------------
-- Daily task logs (one row per Type-1 individual entry,
-- or one row per Type-2/3 group entry)
-- ---------------------------------------------------------
CREATE TABLE daily_task_logs (
  id                   SERIAL PRIMARY KEY,
  log_date             DATE NOT NULL,
  division_id          INTEGER NOT NULL REFERENCES divisions(id),
  task_id              INTEGER NOT NULL REFERENCES tasks(id),
  total_output         NUMERIC(12,2) NOT NULL CHECK (total_output >= 0),
  rate_snapshot        NUMERIC(12,2) NOT NULL,
  base_limit_snapshot  NUMERIC(12,2),
  amount               NUMERIC(14,2) NOT NULL,
  entered_by           INTEGER NOT NULL REFERENCES employees(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_daily_logs_date ON daily_task_logs(log_date);
CREATE INDEX idx_daily_logs_division ON daily_task_logs(division_id);
CREATE INDEX idx_daily_logs_task ON daily_task_logs(task_id);

-- ---------------------------------------------------------
-- Task participants / checklist (who shares in a log's payout)
-- ---------------------------------------------------------
CREATE TABLE task_participants (
  id                  SERIAL PRIMARY KEY,
  daily_task_log_id   INTEGER NOT NULL REFERENCES daily_task_logs(id) ON DELETE CASCADE,
  employee_id         INTEGER NOT NULL REFERENCES employees(id),
  share_amount        NUMERIC(14,2) NOT NULL,
  UNIQUE (daily_task_log_id, employee_id)
);

CREATE INDEX idx_task_participants_employee ON task_participants(employee_id);
CREATE INDEX idx_task_participants_log ON task_participants(daily_task_log_id);

-- ---------------------------------------------------------
-- Immutable audit log (JSONB snapshots).
-- Application layer only ever INSERTs into this table.
-- ---------------------------------------------------------
CREATE TABLE audit_logs (
  id           SERIAL PRIMARY KEY,
  action       audit_action NOT NULL,
  entity       VARCHAR(50) NOT NULL,
  entity_id    INTEGER,
  division_id  INTEGER REFERENCES divisions(id),
  actor_id     INTEGER REFERENCES employees(id),
  old_values   JSONB,
  new_values   JSONB,
  note         TEXT,
  flagged      BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_entity ON audit_logs(entity, entity_id);
CREATE INDEX idx_audit_division ON audit_logs(division_id);
CREATE INDEX idx_audit_flagged ON audit_logs(flagged);
CREATE INDEX idx_audit_created ON audit_logs(created_at);

-- Revoke UPDATE/DELETE at the DB level so the audit trail truly cannot be
-- altered even by a compromised application role. Grant this role to the
-- API's runtime DB user instead of a superuser in production.
-- (Run once you have created the app role; safe to skip in local dev.)
-- REVOKE UPDATE, DELETE ON audit_logs FROM pussalla_app;


-- ---------------------------------------------------------
-- Companies (multi-tenant-ready). Defaults to a single demo
-- company; one deployed instance per customer is the model.
-- ---------------------------------------------------------
CREATE TABLE companies (
  id           SERIAL PRIMARY KEY,
  code         VARCHAR(30) UNIQUE NOT NULL,
  name         VARCHAR(150) NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO companies (id, code, name) VALUES (1, 'INCENTIVIZE', 'Incentivize (Demo)') ON CONFLICT (id) DO NOTHING;

ALTER TABLE divisions  ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id) DEFAULT 1;
ALTER TABLE employees  ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id) DEFAULT 1;
UPDATE divisions SET company_id = 1 WHERE company_id IS NULL;
UPDATE employees SET company_id = 1 WHERE company_id IS NULL;

-- Composite indexes for scale (thousands of employees / log rows).
CREATE INDEX IF NOT EXISTS idx_daily_logs_date_division  ON daily_task_logs(log_date, division_id);
CREATE INDEX IF NOT EXISTS idx_daily_logs_division_date  ON daily_task_logs(division_id, log_date);
CREATE INDEX IF NOT EXISTS idx_task_participants_emp_log ON task_participants(employee_id, daily_task_log_id);
CREATE INDEX IF NOT EXISTS idx_task_participants_log_emp ON task_participants(daily_task_log_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_audit_flagged_created     ON audit_logs(created_at) WHERE flagged = true;
CREATE INDEX IF NOT EXISTS idx_daily_logs_date_task      ON daily_task_logs(log_date, task_id);
