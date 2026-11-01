-- ============================================================
-- Migration 002: sub-divisions + Type 4 (fixed daily rate per person)
-- Additive and idempotent: safe to run more than once, and safe on a
-- database that already has some of these objects.
-- Also run automatically at app startup (see src/db.js ensureSchema).
-- ============================================================

-- Task codes (added by the 31 Aug release; repeated here so a fresh DB is complete)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS code VARCHAR(50);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'tasks'::regclass AND contype = 'u'
                 AND pg_get_constraintdef(oid) = 'UNIQUE (code)') THEN
    ALTER TABLE tasks ADD CONSTRAINT tasks_code_key UNIQUE (code);
  END IF;
END $$;

-- Sub-divisions: one level below a division (e.g. Ganewaththa -> Hanging)
CREATE TABLE IF NOT EXISTS sub_divisions (
  id           SERIAL PRIMARY KEY,
  division_id  INTEGER NOT NULL REFERENCES divisions(id) ON DELETE CASCADE,
  code         VARCHAR(30) NOT NULL,
  name         VARCHAR(120) NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (division_id, code)
);
CREATE INDEX IF NOT EXISTS idx_sub_divisions_division ON sub_divisions(division_id);

ALTER TABLE employees       ADD COLUMN IF NOT EXISTS sub_division_id INTEGER REFERENCES sub_divisions(id) ON DELETE SET NULL;
ALTER TABLE tasks           ADD COLUMN IF NOT EXISTS sub_division_id INTEGER REFERENCES sub_divisions(id) ON DELETE SET NULL;
ALTER TABLE daily_task_logs ADD COLUMN IF NOT EXISTS sub_division_id INTEGER REFERENCES sub_divisions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_employees_sub_division  ON employees(sub_division_id);
CREATE INDEX IF NOT EXISTS idx_tasks_sub_division      ON tasks(sub_division_id);
CREATE INDEX IF NOT EXISTS idx_daily_logs_sub_division ON daily_task_logs(sub_division_id);

-- Type 4 = fixed daily rate per person: each ticked participant earns `rate`.
-- Replace the task_type CHECK (whatever its generated name) with one allowing 1-4.
DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
           WHERE conrelid = 'tasks'::regclass AND contype = 'c'
             AND pg_get_constraintdef(oid) ILIKE '%task_type%'
             AND pg_get_constraintdef(oid) NOT ILIKE '%base_limit%'
  LOOP
    EXECUTE format('ALTER TABLE tasks DROP CONSTRAINT %I', c.conname);
  END LOOP;
  ALTER TABLE tasks ADD CONSTRAINT tasks_task_type_check CHECK (task_type IN (1, 2, 3, 4));
END $$;
