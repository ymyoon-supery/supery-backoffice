-- ============================================================
-- 033_admin_full_approve.sql
-- 전결: admin이 팀장 결재 대기 중인 항목을 직접 승인
-- step1(팀장)은 comment='전결'로 APPROVED, step2(admin WAITING)도 즉시 APPROVED
-- ============================================================

CREATE OR REPLACE FUNCTION admin_full_approve_leave(p_request_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_approver_id UUID;
  v_employee_id UUID;
BEGIN
  v_approver_id := get_my_employee_id();

  IF NOT EXISTS (
    SELECT 1 FROM employees WHERE id = v_approver_id AND role = 'ADMIN' AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Permission denied: admin only';
  END IF;

  SELECT employee_id INTO v_employee_id
  FROM leave_requests
  WHERE id = p_request_id AND status = 'PENDING'
  FOR UPDATE;

  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'Leave request not found or already processed';
  END IF;

  -- 팀장 step: 전결 처리
  UPDATE leave_approval_steps
  SET status = 'APPROVED', comment = '전결', acted_at = now()
  WHERE leave_request_id = p_request_id AND step_order = 1 AND status = 'PENDING';

  -- admin step: WAITING → APPROVED
  UPDATE leave_approval_steps
  SET status = 'APPROVED', acted_at = now()
  WHERE leave_request_id = p_request_id AND step_order = 2 AND status = 'WAITING';

  UPDATE leave_requests SET status = 'APPROVED', updated_at = now()
  WHERE id = p_request_id;

  INSERT INTO outbox_events (idempotency_key, event_type, payload)
  VALUES (
    'CHAT_NOTIFY:leave_approved:' || p_request_id,
    'CHAT_NOTIFY',
    jsonb_build_object('request_id', p_request_id, 'type', 'leave_approved')
  )
  ON CONFLICT (idempotency_key) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION admin_full_approve_expense(p_report_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_approver_id UUID;
BEGIN
  v_approver_id := get_my_employee_id();

  IF NOT EXISTS (
    SELECT 1 FROM employees WHERE id = v_approver_id AND role = 'ADMIN' AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Permission denied: admin only';
  END IF;

  PERFORM 1 FROM expense_reports
  WHERE id = p_report_id AND status = 'PENDING'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense report not found or already processed';
  END IF;

  UPDATE expense_approval_steps
  SET status = 'APPROVED', comment = '전결', acted_at = now()
  WHERE expense_report_id = p_report_id AND step_order = 1 AND status = 'PENDING';

  UPDATE expense_approval_steps
  SET status = 'APPROVED', acted_at = now()
  WHERE expense_report_id = p_report_id AND step_order = 2 AND status = 'WAITING';

  UPDATE expense_reports SET status = 'APPROVED', updated_at = now()
  WHERE id = p_report_id;

  INSERT INTO outbox_events (idempotency_key, event_type, payload)
  VALUES (
    'CHAT_NOTIFY:expense_approved:' || p_report_id,
    'CHAT_NOTIFY',
    jsonb_build_object('report_id', p_report_id, 'type', 'expense_approved')
  )
  ON CONFLICT (idempotency_key) DO NOTHING;
END;
$$;
