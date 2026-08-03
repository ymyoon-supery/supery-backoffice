-- 069_block_cancel_if_step_approved.sql
--
-- Block leave and expense cancellation once any approval step has been APPROVED.
-- Prior behaviour: only the parent row status='PENDING' was checked, so employees
-- could cancel mid-chain after a team lead had already approved step 1.

-- ─── cancel_own_leave_request ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION cancel_own_leave_request(p_request_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_emp_id     UUID;
  v_days_used  NUMERIC;
  v_leave_type TEXT;
BEGIN
  SELECT employee_id, days_used, leave_type
  INTO v_emp_id, v_days_used, v_leave_type
  FROM leave_requests
  WHERE id = p_request_id
    AND status = 'PENDING'
    AND employee_id = (SELECT id FROM employees WHERE auth_user_id = auth.uid() AND is_active = true)
  FOR UPDATE;

  IF v_emp_id IS NULL THEN
    RAISE EXCEPTION '취소할 수 없는 신청입니다.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM leave_approval_steps
    WHERE leave_request_id = p_request_id AND status = 'APPROVED'
  ) THEN
    RAISE EXCEPTION '이미 결재가 진행된 신청은 취소할 수 없습니다.';
  END IF;

  UPDATE leave_requests SET status = 'CANCELLED', updated_at = now()
  WHERE id = p_request_id;

  UPDATE leave_approval_steps SET status = 'CANCELLED'
  WHERE leave_request_id = p_request_id AND status IN ('PENDING', 'WAITING');

  IF v_leave_type IN ('ANNUAL', 'HALF_DAY', 'AM_HALF', 'PM_HALF', 'GROUP') THEN
    UPDATE employees SET remaining_leaves = remaining_leaves + v_days_used
    WHERE id = v_emp_id;
  END IF;

  UPDATE outbox_events
  SET status = 'DONE', processed_at = now()
  WHERE idempotency_key = 'CALENDAR_INSERT:leave:' || p_request_id
    AND status = 'PENDING';
END;
$$;

-- ─── cancel_own_expense_request ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION cancel_own_expense_request(p_report_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_emp_id UUID;
BEGIN
  SELECT employee_id INTO v_emp_id
  FROM expense_reports
  WHERE id = p_report_id
    AND status = 'PENDING'
    AND employee_id = (
      SELECT id FROM employees WHERE auth_user_id = auth.uid() AND is_active = true
    )
  FOR UPDATE;

  IF v_emp_id IS NULL THEN
    RAISE EXCEPTION '취소할 수 없는 신청입니다.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM expense_approval_steps
    WHERE expense_report_id = p_report_id AND status = 'APPROVED'
  ) THEN
    RAISE EXCEPTION '이미 결재가 진행된 신청은 취소할 수 없습니다.';
  END IF;

  UPDATE expense_reports SET status = 'CANCELLED', updated_at = now()
  WHERE id = p_report_id;

  UPDATE expense_approval_steps SET status = 'CANCELLED'
  WHERE expense_report_id = p_report_id AND status IN ('PENDING', 'WAITING');
END;
$$;
