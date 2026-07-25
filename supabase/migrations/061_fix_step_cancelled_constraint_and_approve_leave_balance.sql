-- 061_fix_step_cancelled_constraint_and_approve_leave_balance.sql
--
-- Fix 1: leave_approval_steps missing CANCELLED in CHECK constraint
--         cancel_own_leave_request (migration 060) was always failing with constraint violation
-- Fix 2: supply_approval_steps missing CANCELLED in CHECK constraint
--         cancelSupplyRequest step-cleanup was silently failing; approvers kept seeing cancelled requests
-- Fix 3: approve_leave_step unconditionally restores remaining_leaves even for SICK/COMP/OTHER
--         rejecting a non-deductible leave gifted the employee free annual leave days
-- Fix 4: cancel_own_expense_request RPC — atomic cancel with FOR UPDATE lock
--         old bare table updates had no lock and silently dropped the step error

-- ─── Fix 1 ────────────────────────────────────────────────────────────────────
ALTER TABLE leave_approval_steps
  DROP CONSTRAINT IF EXISTS leave_approval_steps_status_check;
ALTER TABLE leave_approval_steps
  ADD CONSTRAINT leave_approval_steps_status_check
  CHECK (status IN ('WAITING', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'));

-- ─── Fix 2 ────────────────────────────────────────────────────────────────────
ALTER TABLE supply_approval_steps
  DROP CONSTRAINT IF EXISTS supply_approval_steps_status_check;
ALTER TABLE supply_approval_steps
  ADD CONSTRAINT supply_approval_steps_status_check
  CHECK (status IN ('WAITING', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'));

-- ─── Fix 3: approve_leave_step ────────────────────────────────────────────────
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
  v_leave_type    TEXT;
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

  SELECT days_used, employee_id, leave_type
  INTO v_days_used, v_employee_id, v_leave_type
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

    -- Only restore balance for deductible leave types
    IF v_leave_type IN ('ANNUAL', 'HALF_DAY', 'AM_HALF', 'PM_HALF', 'GROUP') THEN
      UPDATE employees
      SET remaining_leaves = remaining_leaves + v_days_used
      WHERE id = v_employee_id;
    END IF;

    UPDATE outbox_events
    SET status = 'DONE', processed_at = now()
    WHERE idempotency_key = 'CALENDAR_INSERT:leave:' || p_request_id
      AND status = 'PENDING';

    RETURN;
  END IF;

  -- Activate next WAITING step (sequential approval)
  UPDATE leave_approval_steps
  SET status = 'PENDING'
  WHERE leave_request_id = p_request_id
    AND step_order = v_step.step_order + 1
    AND status = 'WAITING';

  -- All non-WAITING steps APPROVED → final approval
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

-- ─── Fix 4: cancel_own_expense_request ───────────────────────────────────────
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

  UPDATE expense_reports SET status = 'CANCELLED', updated_at = now()
  WHERE id = p_report_id;

  UPDATE expense_approval_steps SET status = 'CANCELLED'
  WHERE expense_report_id = p_report_id AND status IN ('PENDING', 'WAITING');
END;
$$;
