-- ============================================================
-- 003_rls_policies.sql
-- Row Level Security policies for all tables
-- Depends on: 001_initial_schema.sql, 002_rls_helpers.sql
-- NOTE: Apply 002_rls_helpers.sql before this file
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE employees           ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records  ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_requests      ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_approval_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_reports     ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_approval_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox_events       ENABLE ROW LEVEL SECURITY;

-- ── employees ──────────────────────────────────────────────

-- All authenticated users can read active employees (org chart, approver selection)
CREATE POLICY "employees_select_authenticated"
  ON employees FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Users can update their own profile (limited fields via application layer)
CREATE POLICY "employees_update_own"
  ON employees FOR UPDATE
  TO authenticated
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

-- Only admins can insert/delete employees
CREATE POLICY "employees_insert_admin"
  ON employees FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "employees_delete_admin"
  ON employees FOR DELETE
  TO authenticated
  USING (is_admin());

-- Admins can update any employee
CREATE POLICY "employees_update_admin"
  ON employees FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- ── departments ────────────────────────────────────────────

CREATE POLICY "departments_select_authenticated"
  ON departments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "departments_write_admin"
  ON departments FOR ALL
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- ── attendance_records ─────────────────────────────────────

-- Employees see only their own records; admins/managers see all
CREATE POLICY "attendance_select_own"
  ON attendance_records FOR SELECT
  TO authenticated
  USING (
    employee_id = get_my_employee_id()
    OR is_admin()
    OR is_manager_of(employee_id)
  );

-- Employees can insert their own records
CREATE POLICY "attendance_insert_own"
  ON attendance_records FOR INSERT
  TO authenticated
  WITH CHECK (employee_id = get_my_employee_id());

-- Only admins can update/delete attendance (for corrections)
CREATE POLICY "attendance_update_admin"
  ON attendance_records FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "attendance_delete_admin"
  ON attendance_records FOR DELETE
  TO authenticated
  USING (is_admin());

-- ── leave_requests ─────────────────────────────────────────

CREATE POLICY "leave_select"
  ON leave_requests FOR SELECT
  TO authenticated
  USING (
    employee_id = get_my_employee_id()
    OR is_admin()
    OR is_manager_of(employee_id)
    OR is_leave_approver(id)
  );

CREATE POLICY "leave_insert_own"
  ON leave_requests FOR INSERT
  TO authenticated
  WITH CHECK (employee_id = get_my_employee_id());

-- Status updates happen via RPC; direct updates only for cancellation by owner
CREATE POLICY "leave_update_own_cancel"
  ON leave_requests FOR UPDATE
  TO authenticated
  USING (
    (employee_id = get_my_employee_id() AND status = 'PENDING')
    OR is_admin()
  )
  WITH CHECK (
    (employee_id = get_my_employee_id() AND status IN ('PENDING', 'CANCELLED'))
    OR is_admin()
  );

-- ── leave_approval_steps ───────────────────────────────────

CREATE POLICY "leave_steps_select"
  ON leave_approval_steps FOR SELECT
  TO authenticated
  USING (
    approver_id = get_my_employee_id()
    OR is_admin()
    OR EXISTS (
      SELECT 1 FROM leave_requests lr
      WHERE lr.id = leave_request_id
        AND lr.employee_id = get_my_employee_id()
    )
  );

-- Steps managed by RPC only; no direct insert/update from client
CREATE POLICY "leave_steps_write_admin"
  ON leave_approval_steps FOR ALL
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- ── expense_reports ────────────────────────────────────────

CREATE POLICY "expense_select"
  ON expense_reports FOR SELECT
  TO authenticated
  USING (
    employee_id = get_my_employee_id()
    OR is_admin()
    OR is_manager_of(employee_id)
    OR is_expense_approver(id)
  );

CREATE POLICY "expense_insert_own"
  ON expense_reports FOR INSERT
  TO authenticated
  WITH CHECK (employee_id = get_my_employee_id());

CREATE POLICY "expense_update_own_cancel"
  ON expense_reports FOR UPDATE
  TO authenticated
  USING (
    (employee_id = get_my_employee_id() AND status = 'PENDING')
    OR is_admin()
  )
  WITH CHECK (
    (employee_id = get_my_employee_id() AND status IN ('PENDING', 'CANCELLED'))
    OR is_admin()
  );

-- ── expense_approval_steps ─────────────────────────────────

CREATE POLICY "expense_steps_select"
  ON expense_approval_steps FOR SELECT
  TO authenticated
  USING (
    approver_id = get_my_employee_id()
    OR is_admin()
    OR EXISTS (
      SELECT 1 FROM expense_reports er
      WHERE er.id = expense_report_id
        AND er.employee_id = get_my_employee_id()
    )
  );

CREATE POLICY "expense_steps_write_admin"
  ON expense_approval_steps FOR ALL
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- ── outbox_events ──────────────────────────────────────────

-- No direct client access; service role only via Cron
CREATE POLICY "outbox_no_client_access"
  ON outbox_events FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);
