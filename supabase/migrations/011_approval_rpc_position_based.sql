-- ============================================================
-- 011_approval_rpc_position_based.sql
-- Update approval RPCs to use position-based manager lookup
-- 팀원 → 팀장(step1) → ADMIN(step2)
-- 팀장 → ADMIN(step1, direct)
-- ============================================================

CREATE OR REPLACE FUNCTION validate_and_submit_leave(
  p_leave_type    TEXT,
  p_start_date    DATE,
  p_end_date      DATE,
  p_days_used     NUMERIC,
  p_reason        TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_employee_id   UUID;
  v_request_id    UUID;
  v_manager_id    UUID;
  v_admin_id      UUID;
  v_position      TEXT;
  v_dept_id       UUID;
BEGIN
  SELECT id, position, department_id
  INTO v_employee_id, v_position, v_dept_id
  FROM employees
  WHERE auth_user_id = auth.uid() AND is_active = true
  FOR UPDATE;

  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'Employee not found';
  END IF;

  IF p_leave_type IN ('ANNUAL', 'HALF_DAY') THEN
    PERFORM 1 FROM employees
    WHERE id = v_employee_id AND remaining_leaves >= p_days_used;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Insufficient leave balance';
    END IF;
    UPDATE employees
    SET remaining_leaves = remaining_leaves - p_days_used
    WHERE id = v_employee_id;
  END IF;

  INSERT INTO leave_requests (
    employee_id, leave_type, start_date, end_date, days_used, reason, status
  ) VALUES (
    v_employee_id, p_leave_type, p_start_date, p_end_date, p_days_used, p_reason, 'PENDING'
  )
  RETURNING id INTO v_request_id;

  -- 팀장은 바로 ADMIN에게 결재, 팀원은 팀장 → ADMIN
  IF v_position = '팀장' THEN
    v_manager_id := NULL;
  ELSIF v_dept_id IS NOT NULL THEN
    SELECT id INTO v_manager_id
    FROM employees
    WHERE department_id = v_dept_id
      AND position = '팀장'
      AND is_active = true
      AND id != v_employee_id
    LIMIT 1;
  END IF;

  SELECT id INTO v_admin_id
  FROM employees
  WHERE role = 'ADMIN' AND is_active = true
  ORDER BY created_at
  LIMIT 1;

  IF v_manager_id IS NOT NULL THEN
    INSERT INTO leave_approval_steps (leave_request_id, approver_id, step_order)
    VALUES (v_request_id, v_manager_id, 1);
    IF v_admin_id IS NOT NULL AND v_admin_id != v_manager_id THEN
      INSERT INTO leave_approval_steps (leave_request_id, approver_id, step_order)
      VALUES (v_request_id, v_admin_id, 2);
    END IF;
  ELSIF v_admin_id IS NOT NULL THEN
    INSERT INTO leave_approval_steps (leave_request_id, approver_id, step_order)
    VALUES (v_request_id, v_admin_id, 1);
  END IF;

  INSERT INTO outbox_events (idempotency_key, event_type, payload)
  VALUES (
    'CALENDAR_INSERT:leave:' || v_request_id,
    'CALENDAR_INSERT',
    jsonb_build_object(
      'request_id', v_request_id, 'employee_id', v_employee_id,
      'start_date', p_start_date, 'end_date', p_end_date, 'leave_type', p_leave_type
    )
  )
  ON CONFLICT (idempotency_key) DO NOTHING;

  RETURN v_request_id;
END;
$$;

CREATE OR REPLACE FUNCTION submit_expense_report(
  p_title         TEXT,
  p_amount        INTEGER,
  p_category      TEXT,
  p_expense_date  DATE,
  p_receipt_url   TEXT DEFAULT NULL,
  p_description   TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_employee_id   UUID;
  v_report_id     UUID;
  v_manager_id    UUID;
  v_admin_id      UUID;
  v_position      TEXT;
  v_dept_id       UUID;
BEGIN
  SELECT id, position, department_id
  INTO v_employee_id, v_position, v_dept_id
  FROM employees
  WHERE auth_user_id = auth.uid() AND is_active = true;

  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'Employee not found';
  END IF;

  INSERT INTO expense_reports (
    employee_id, title, amount, category, expense_date, receipt_url, description
  ) VALUES (
    v_employee_id, p_title, p_amount, p_category, p_expense_date, p_receipt_url, p_description
  )
  RETURNING id INTO v_report_id;

  IF v_position = '팀장' THEN
    v_manager_id := NULL;
  ELSIF v_dept_id IS NOT NULL THEN
    SELECT id INTO v_manager_id
    FROM employees
    WHERE department_id = v_dept_id
      AND position = '팀장'
      AND is_active = true
      AND id != v_employee_id
    LIMIT 1;
  END IF;

  SELECT id INTO v_admin_id
  FROM employees
  WHERE role = 'ADMIN' AND is_active = true
  ORDER BY created_at
  LIMIT 1;

  IF v_manager_id IS NOT NULL THEN
    INSERT INTO expense_approval_steps (expense_report_id, approver_id, step_order)
    VALUES (v_report_id, v_manager_id, 1);
    IF v_admin_id IS NOT NULL AND v_admin_id != v_manager_id THEN
      INSERT INTO expense_approval_steps (expense_report_id, approver_id, step_order)
      VALUES (v_report_id, v_admin_id, 2);
    END IF;
  ELSIF v_admin_id IS NOT NULL THEN
    INSERT INTO expense_approval_steps (expense_report_id, approver_id, step_order)
    VALUES (v_report_id, v_admin_id, 1);
  END IF;

  RETURN v_report_id;
END;
$$;
