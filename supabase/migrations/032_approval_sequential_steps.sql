-- ============================================================
-- 032_approval_sequential_steps.sql
-- Sequential approval: step2(admin) waits until step1(팀장) approves
-- WAITING = 대기 중 (이전 step 미완료), PENDING = 결재 가능
-- ============================================================

-- 1. Extend CHECK constraints to allow WAITING status
ALTER TABLE leave_approval_steps
  DROP CONSTRAINT IF EXISTS leave_approval_steps_status_check;
ALTER TABLE leave_approval_steps
  ADD CONSTRAINT leave_approval_steps_status_check
  CHECK (status IN ('WAITING', 'PENDING', 'APPROVED', 'REJECTED'));

ALTER TABLE expense_approval_steps
  DROP CONSTRAINT IF EXISTS expense_approval_steps_status_check;
ALTER TABLE expense_approval_steps
  ADD CONSTRAINT expense_approval_steps_status_check
  CHECK (status IN ('WAITING', 'PENDING', 'APPROVED', 'REJECTED'));

-- 2. Update validate_and_submit_leave: step2 inserted as WAITING
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

  IF p_leave_type IN ('ANNUAL', 'HALF_DAY', 'AM_HALF', 'PM_HALF', 'GROUP') THEN
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

  -- 팀장은 바로 ADMIN 결재, 팀원은 팀장(step1 PENDING) → ADMIN(step2 WAITING)
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
    INSERT INTO leave_approval_steps (leave_request_id, approver_id, step_order, status)
    VALUES (v_request_id, v_manager_id, 1, 'PENDING');
    IF v_admin_id IS NOT NULL AND v_admin_id != v_manager_id THEN
      -- step2: admin은 팀장 승인 후 활성화
      INSERT INTO leave_approval_steps (leave_request_id, approver_id, step_order, status)
      VALUES (v_request_id, v_admin_id, 2, 'WAITING');
    END IF;
  ELSIF v_admin_id IS NOT NULL THEN
    INSERT INTO leave_approval_steps (leave_request_id, approver_id, step_order, status)
    VALUES (v_request_id, v_admin_id, 1, 'PENDING');
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

-- 3. Update submit_expense_report: step2 inserted as WAITING
CREATE OR REPLACE FUNCTION submit_expense_report(
  p_title                 TEXT,
  p_amount                INTEGER,
  p_category              TEXT,
  p_expense_date          DATE,
  p_receipt_url           TEXT DEFAULT NULL,
  p_description           TEXT DEFAULT NULL,
  p_payee                 TEXT DEFAULT NULL,
  p_payment_method        TEXT DEFAULT NULL,
  p_bank_name             TEXT DEFAULT NULL,
  p_account_number        TEXT DEFAULT NULL,
  p_account_holder        TEXT DEFAULT NULL,
  p_payment_request_date  DATE DEFAULT NULL,
  p_settlement_date       DATE DEFAULT NULL,
  p_line_items            JSONB DEFAULT '[]'::jsonb,
  p_attachment_urls       JSONB DEFAULT '[]'::jsonb
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
    employee_id, title, amount, category, expense_date, receipt_url, description,
    payee, payment_method, bank_name, account_number, account_holder,
    payment_request_date, settlement_date, line_items, attachment_urls
  ) VALUES (
    v_employee_id, p_title, p_amount, p_category, p_expense_date, p_receipt_url, p_description,
    p_payee, p_payment_method, p_bank_name, p_account_number, p_account_holder,
    p_payment_request_date, p_settlement_date, p_line_items, p_attachment_urls
  )
  RETURNING id INTO v_report_id;

  -- 팀장은 바로 ADMIN 결재, 팀원은 팀장(step1 PENDING) → ADMIN(step2 WAITING)
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
    INSERT INTO expense_approval_steps (expense_report_id, approver_id, step_order, status)
    VALUES (v_report_id, v_manager_id, 1, 'PENDING');
    IF v_admin_id IS NOT NULL AND v_admin_id != v_manager_id THEN
      INSERT INTO expense_approval_steps (expense_report_id, approver_id, step_order, status)
      VALUES (v_report_id, v_admin_id, 2, 'WAITING');
    END IF;
  ELSIF v_admin_id IS NOT NULL THEN
    INSERT INTO expense_approval_steps (expense_report_id, approver_id, step_order, status)
    VALUES (v_report_id, v_admin_id, 1, 'PENDING');
  END IF;

  RETURN v_report_id;
END;
$$;

-- 4. Update approve_leave_step: activate next WAITING step on approval
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

  SELECT days_used, employee_id INTO v_days_used, v_employee_id
  FROM leave_requests
  WHERE id = p_request_id AND status = 'PENDING'
  FOR UPDATE;

  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'Leave request not found or already processed';
  END IF;

  UPDATE leave_approval_steps
  SET status = CASE WHEN p_approved THEN 'APPROVED' ELSE 'REJECTED' END,
      comment = p_comment,
      acted_at = now()
  WHERE id = v_step.id;

  IF NOT p_approved THEN
    UPDATE leave_requests SET status = 'REJECTED', updated_at = now()
    WHERE id = p_request_id;

    UPDATE employees
    SET remaining_leaves = remaining_leaves + v_days_used
    WHERE id = v_employee_id;

    UPDATE outbox_events
    SET status = 'DONE', processed_at = now()
    WHERE idempotency_key = 'CALENDAR_INSERT:leave:' || p_request_id
      AND status = 'PENDING';

    RETURN;
  END IF;

  -- 다음 WAITING step 활성화 (순차 결재)
  UPDATE leave_approval_steps
  SET status = 'PENDING'
  WHERE leave_request_id = p_request_id
    AND step_order = v_step.step_order + 1
    AND status = 'WAITING';

  -- 모든 step이 APPROVED이면 최종 승인 (WAITING 제외)
  SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'APPROVED')
  INTO v_total_steps, v_done_steps
  FROM leave_approval_steps
  WHERE leave_request_id = p_request_id
    AND status != 'WAITING';

  IF v_total_steps = v_done_steps THEN
    UPDATE leave_requests SET status = 'APPROVED', updated_at = now()
    WHERE id = p_request_id;

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

-- 5. Update approve_expense_step: activate next WAITING step on approval
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

  -- 다음 WAITING step 활성화 (순차 결재)
  UPDATE expense_approval_steps
  SET status = 'PENDING'
  WHERE expense_report_id = p_report_id
    AND step_order = v_step.step_order + 1
    AND status = 'WAITING';

  -- 모든 step이 APPROVED이면 최종 승인 (WAITING 제외)
  SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'APPROVED')
  INTO v_total_steps, v_done_steps
  FROM expense_approval_steps
  WHERE expense_report_id = p_report_id
    AND status != 'WAITING';

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
