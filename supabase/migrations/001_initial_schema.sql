-- ============================================================
-- 001_initial_schema.sql
-- Core tables for SuperY WorkSync
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Departments
CREATE TABLE departments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  manager_id  UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Employees (linked to Supabase Auth)
CREATE TABLE employees (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id    UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  department_id   UUID REFERENCES departments(id) ON DELETE SET NULL,
  name            TEXT NOT NULL,
  email           TEXT NOT NULL UNIQUE,
  role            TEXT NOT NULL DEFAULT 'EMPLOYEE'
                    CHECK (role IN ('ADMIN', 'MANAGER', 'EMPLOYEE')),
  phone           TEXT,
  position        TEXT,
  google_user_id  TEXT UNIQUE,
  avatar_url      TEXT,
  annual_leave_days   INTEGER NOT NULL DEFAULT 15,
  remaining_leaves    NUMERIC(4,1) NOT NULL DEFAULT 15,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  hired_at        DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Circular FK: departments.manager_id → employees
ALTER TABLE departments
  ADD CONSTRAINT fk_departments_manager
  FOREIGN KEY (manager_id) REFERENCES employees(id) ON DELETE SET NULL;

-- Attendance records
CREATE TABLE attendance_records (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id   UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  recorded_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  type          TEXT NOT NULL CHECK (type IN ('CHECK_IN', 'CHECK_OUT')),
  location      TEXT,
  latitude      NUMERIC(10, 7),
  longitude     NUMERIC(10, 7),
  is_field      BOOLEAN NOT NULL DEFAULT false,
  note          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One CHECK_IN and one CHECK_OUT per employee per KST day
CREATE UNIQUE INDEX uniq_attendance_daily
  ON attendance_records (
    employee_id,
    ((recorded_at AT TIME ZONE 'Asia/Seoul')::date),
    type
  );

-- Leave requests
CREATE TABLE leave_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id   UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type    TEXT NOT NULL CHECK (leave_type IN ('ANNUAL', 'SICK', 'HALF_DAY', 'OTHER')),
  start_date    DATE NOT NULL,
  end_date      DATE NOT NULL,
  days_used     NUMERIC(4,1) NOT NULL,
  reason        TEXT,
  status        TEXT NOT NULL DEFAULT 'PENDING'
                  CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT leave_date_order CHECK (end_date >= start_date)
);

-- Leave approval steps (explicit FK for referential integrity)
CREATE TABLE leave_approval_steps (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  leave_request_id  UUID NOT NULL REFERENCES leave_requests(id) ON DELETE CASCADE,
  approver_id       UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  step_order        INTEGER NOT NULL,
  status            TEXT NOT NULL DEFAULT 'PENDING'
                      CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  comment           TEXT,
  acted_at          TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (leave_request_id, step_order)
);

-- Expense reports
CREATE TABLE expense_reports (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id   UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  amount        INTEGER NOT NULL CHECK (amount > 0),
  category      TEXT NOT NULL CHECK (category IN ('TRANSPORT', 'MEAL', 'ACCOMMODATION', 'SUPPLIES', 'OTHER')),
  expense_date  DATE NOT NULL,
  receipt_url   TEXT,
  description   TEXT,
  status        TEXT NOT NULL DEFAULT 'PENDING'
                  CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Expense approval steps (explicit FK for referential integrity)
CREATE TABLE expense_approval_steps (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_report_id   UUID NOT NULL REFERENCES expense_reports(id) ON DELETE CASCADE,
  approver_id         UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  step_order          INTEGER NOT NULL,
  status              TEXT NOT NULL DEFAULT 'PENDING'
                        CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  comment             TEXT,
  acted_at            TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (expense_report_id, step_order)
);

-- Outbox events for async Google API calls
CREATE TABLE outbox_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key   TEXT NOT NULL UNIQUE,
  event_type        TEXT NOT NULL CHECK (
                      event_type IN (
                        'CALENDAR_INSERT', 'CALENDAR_DELETE',
                        'DRIVE_UPLOAD', 'CHAT_NOTIFY'
                      )
                    ),
  payload           JSONB NOT NULL,
  status            TEXT NOT NULL DEFAULT 'PENDING'
                      CHECK (status IN ('PENDING', 'PROCESSING', 'DONE', 'FAILED')),
  retry_count       INTEGER NOT NULL DEFAULT 0,
  last_error        TEXT,
  scheduled_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_outbox_pending ON outbox_events (scheduled_at)
  WHERE status = 'PENDING';

-- updated_at triggers
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_employees_updated_at
  BEFORE UPDATE ON employees
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_leave_requests_updated_at
  BEFORE UPDATE ON leave_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_expense_reports_updated_at
  BEFORE UPDATE ON expense_reports
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
