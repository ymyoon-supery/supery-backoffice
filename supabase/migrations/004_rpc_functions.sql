-- ============================================================
-- 004_rpc_functions.sql
-- Atomic RPC functions for approval flows
-- Uses SELECT FOR UPDATE to prevent race conditions
-- All functions use SET search_path to prevent injection
-- ============================================================

-- Submit a leave request atomically
-- Checks remaining_leaves balance and creates approval steps in one transaction
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
BEGIN
  -- Lock the employee row to prevent concurrent leave submissions
  SELECT id INTO v_employee_id
  FROM employees
  WHERE auth_user_id = auth.uid() AND is_active = true
  FOR UPDATE;

  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'Employee not found';
  END IF;

  -- Validate leave balance for ANNUAL and HALF_DAY types
  IF p_leave_type IN ('ANNUAL', 'HALF_DAY') THEN
    PERFORM 1 FROM employees
    WHERE id = v_employee_id
      AND remaining_leaves >= p_days_used;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Insufficient leave balance';
    END IF;

    -- Deduct balance immediately (reversed if rejected)
    UPDATE employees
    SET remaining_leaves = remaining_leaves - p_days_used
    WHERE id = v_employee_id;
  END IF;

  -- Create the leave request
  INSERT INTO leave_requests (
    employee_id, leave_type, start_date, end_date, days_used, reason, status
  ) VALUES (
    v_employee_id, p_leave_type, p_start_date, p_end_date, p_days_used, p_reason, 'PENDING'
  )
  RETURNING id INTO v_request_id;

  -- Find the employee's department manager for step 1
  SELECT d.manager_id INTO v_manager_id
  FROM employees e
  JOIN departments d ON d.id = e.department_id
  WHERE e.id = v_employee_id
    AND d.manager_id IS NOT NULL
    AND d.manager_id != v_employee_id;

  -- Find an admin for step 2 (or step 1 if no manager)
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

  -- Queue Calendar event creation in outbox
  INSERT INTO outbox_events (idempotency_key, event_type, payload)
  VALUES (
    'CALENDAR_INSERT:leave:' || v_request_id,
    'CALENDAR_INSERT',
    jsonb_build_object(
      'request_id', v_request_id,
      'employee_id', v_employee_id,
      'start_date', p_start_date,
      'end_date', p_end_date,
      'leave_type', p_leave_type
    )
  )
  ON CONFLICT (idempotency_key) DO NOTHING;

  RETURN v_request_id;
END;
$$;

-- Approve a leave request step
-- Advances to next step or fully approves; handles rejection with balance restoration
CREATE OR REPLACE FUNCTION approve_leave_step(
  p_request_id  UUID,
  p_approved    BOOLEAN,
  p_comment     TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_approver_id   UUID;
  v_step          leave_approval_steps%ROWTYPE;
  v_total_steps   INTEGER;
  v_done_steps    INTEGER;
  v_days_used     NUMERIC;
  v_employee_id   UUID;
BEGIN
  v_approver_id := get_my_employee_id();

  -- Lock the pending step for this approver
  SELECT * INTO v_step
  FROM leave_approval_steps
  WHERE leave_request_id = p_request_id
    AND approver_id = v_approver_id
    AND status = 'PENDING'
  ORDER BY step_order
  LIMIT 1
  FOR UPDATE;

  IF v_step.id IS NULL THEN
    RAISE EXCEPTION 'No pending approval step found for this user';
  END IF;

  -- Lock the leave request
  SELECT days_used, employee_id INTO v_days_used, v_employee_id
  FROM leave_requests
  WHERE id = p_request_id AND status = 'PENDING'
  FOR UPDATE;

  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'Leave request not found or already processed';
  END IF;

  -- Update the step
  UPDATE leave_approval_steps
  SET status = CASE WHEN p_approved THEN 'APPROVED' ELSE 'REJECTED' END,
      comment = p_comment,
      acted_at = now()
  WHERE id = v_step.id;

  IF NOT p_approved THEN
    -- Reject the request and restore leave balance
    UPDATE leave_requests SET status = 'REJECTED', updated_at = now()
    WHERE id = p_request_id;

    UPDATE employees
    SET remaining_leaves = remaining_leaves + v_days_used
    WHERE id = v_employee_id;

    -- Remove calendar event if queued
    UPDATE outbox_events
    SET status = 'DONE', processed_at = now()
    WHERE idempotency_key = 'CALENDAR_INSERT:leave:' || p_request_id
      AND status = 'PENDING';

    RETURN;
  END IF;

  -- Check if all steps are approved
  SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'APPROVED')
  INTO v_total_steps, v_done_steps
  FROM leave_approval_steps
  WHERE leave_request_id = p_request_id;

  IF v_total_steps = v_done_steps THEN
    UPDATE leave_requests SET status = 'APPROVED', updated_at = now()
    WHERE id = p_request_id;

    -- Notify via Chat
    INSERT INTO outbox_events (idempotency_key, event_type, payload)
    VALUES (
      'CHAT_NOTIFY:leave_approved:' || p_request_id,
      'CHAT_NOTIFY',
      jsonb_build_object('request_id', p_request_id, 'type', 'leave_approved')
    )
    ON CONFLICT (idempotency_key) DO NOTHING;
  END IF;
END;
$$;

-- Approve an expense report step
CREATE OR REPLACE FUNCTION approve_expense_step(
  p_report_id   UUID,
  p_approved    BOOLEAN,
  p_comment     TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_approver_id   UUID;
  v_step          expense_approval_steps%ROWTYPE;
  v_total_steps   INTEGER;
  v_done_steps    INTEGER;
BEGIN
  v_approver_id := get_my_employee_id();

  SELECT * INTO v_step
  FROM expense_approval_steps
  WHERE expense_report_id = p_report_id
    AND approver_id = v_approver_id
    AND status = 'PENDING'
  ORDER BY step_order
  LIMIT 1
  FOR UPDATE;

  IF v_step.id IS NULL THEN
    RAISE EXCEPTION 'No pending approval step found for this user';
  END IF;

  PERFORM 1 FROM expense_reports
  WHERE id = p_report_id AND status = 'PENDING'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense report not found or already processed';
  END IF;

  UPDATE expense_approval_steps
  SET status = CASE WHEN p_approved THEN 'APPROVED' ELSE 'REJECTED' END,
      comment = p_comment,
      acted_at = now()
  WHERE id = v_step.id;

  IF NOT p_approved THEN
    UPDATE expense_reports SET status = 'REJECTED', updated_at = now()
    WHERE id = p_report_id;
    RETURN;
  END IF;

  SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'APPROVED')
  INTO v_total_steps, v_done_steps
  FROM expense_approval_steps
  WHERE expense_report_id = p_report_id;

  IF v_total_steps = v_done_steps THEN
    UPDATE expense_reports SET status = 'APPROVED', updated_at = now()
    WHERE id = p_report_id;

    INSERT INTO outbox_events (idempotency_key, event_type, payload)
    VALUES (
      'CHAT_NOTIFY:expense_approved:' || p_report_id,
      'CHAT_NOTIFY',
      jsonb_build_object('report_id', p_report_id, 'type', 'expense_approved')
    )
    ON CONFLICT (idempotency_key) DO NOTHING;
  END IF;
END;
$$;

-- Submit an expense report and create approval steps atomically
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
BEGIN
  SELECT id INTO v_employee_id
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

  SELECT d.manager_id INTO v_manager_id
  FROM employees e
  JOIN departments d ON d.id = e.department_id
  WHERE e.id = v_employee_id
    AND d.manager_id IS NOT NULL
    AND d.manager_id != v_employee_id;

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
