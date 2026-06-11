CREATE TABLE home_location_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id   UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  new_lat       NUMERIC(10, 7) NOT NULL,
  new_lng       NUMERIC(10, 7) NOT NULL,
  location_name TEXT,
  status        TEXT NOT NULL DEFAULT 'PENDING'
                  CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  comment       TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE home_location_requests ENABLE ROW LEVEL SECURITY;

-- Employee: read own requests
CREATE POLICY "employee_read_own" ON home_location_requests
  FOR SELECT USING (
    employee_id = (SELECT id FROM employees WHERE auth_user_id = auth.uid())
  );

-- Employee: insert own requests
CREATE POLICY "employee_insert_own" ON home_location_requests
  FOR INSERT WITH CHECK (
    employee_id = (SELECT id FROM employees WHERE auth_user_id = auth.uid())
  );
