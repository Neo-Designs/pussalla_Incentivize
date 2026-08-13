-- ============================================================
-- Migration 001: scale hardening + multi-tenant-ready structure
-- Idempotent: safe to run on a fresh or existing schema.
-- Run with: psql -U <user> -d pussalla -f src/migrations/001_scale_and_tenants.sql
-- ============================================================

-- ---------------------------------------------------------
-- Multi-tenant-ready: a companies table + optional company_id FK.
-- Defaults to a single demo company so the existing single-tenant
-- demo keeps working unchanged.
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS companies (
  id           SERIAL PRIMARY KEY,
  code         VARCHAR(30) UNIQUE NOT NULL,
  name         VARCHAR(150) NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO companies (id, code, name)
VALUES (1, 'PUSSALLA', 'Pussalla Farms (Demo)')
ON CONFLICT (id) DO NOTHING;

-- companies reference on divisions / employees (nullable for back-compat).
-- One deployed instance per company is the default model; the column makes
-- the data model multi-company-aware for the future.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'divisions' AND column_name = 'company_id') THEN
    ALTER TABLE divisions ADD COLUMN company_id INTEGER REFERENCES companies(id) DEFAULT 1;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'employees' AND column_name = 'company_id') THEN
    ALTER TABLE employees ADD COLUMN company_id INTEGER REFERENCES companies(id) DEFAULT 1;
  END IF;
END $$;

-- Backfill any NULL company_id to the demo company, then enforce.
UPDATE divisions SET company_id = 1 WHERE company_id IS NULL;
UPDATE employees SET company_id = 1 WHERE company_id IS NULL;

-- ---------------------------------------------------------
-- Composite indexes for scale (thousands of employees / log rows).
-- ---------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_daily_logs_date_division ON daily_task_logs(log_date, division_id);
CREATE INDEX IF NOT EXISTS idx_daily_logs_division_date ON daily_task_logs(division_id, log_date);
CREATE INDEX IF NOT EXISTS idx_task_participants_emp_log ON task_participants(employee_id, daily_task_log_id);
CREATE INDEX IF NOT EXISTS idx_task_participants_log_emp ON task_participants(daily_task_log_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_audit_flagged_created ON audit_logs(created_at) WHERE flagged = true;
CREATE INDEX IF NOT EXISTS idx_daily_logs_date_task ON daily_task_logs(log_date, task_id);
