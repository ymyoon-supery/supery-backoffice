-- 060_fix_leave_cancel_reject_supply_lock.sql
--
-- Fix 1: admin_full_reject_leave — restore remaining_leaves on rejection
--         (was silently burning leave days every time admin rejected)
-- Fix 2: cancel_own_leave_request — new RPC for atomic employee-side cancel
--         (direct table updates in cancelLeaveRequest skipped balance refund)
-- Fix 3: approve_supply_step — add FOR UPDATE to prevent double-click race

-- ─── Fix 1: admin_full_reject_leave ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_full_reject_leave(
  p_request_id UUID,
  p_comment    TEXT DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_admin_id   UUID;
  v_employee_id UUID;
  v_days_used  NUMERIC;
  v_leave_type TEXT;
BEGIN
  SELECT id INTO v_admin_id FROM employees
  WHERE auth_user_id = auth.uid() AND role = 'ADMIN';
  IF v_admin_id IS NULL THEN RAISE EXCEPTION 'Not authorized'; END IF;

  SELECT employee_id, days_used, leave_type
  INTO v_employee_id, v_days_used, v_leave_type
  FROM leave_requests
  WHERE id = p_request_id AND status = 'PENDING'
  FOR UPDATE;

  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'Leave request not found or already processed';
  END IF;

  UPDATE leave_approval_steps
  SET status = 'REJECTED', comment = p_comment, acted_at = NOW()
  WHERE leave_request_id = p_request_id AND status IN ('PENDING', 'WAITING');

  UPDATE leave_requests
  SET status = 'REJECTED', updated_at = now()
  WHERE id = p_request_id;

  -- Restore deducted leave balance
  IF v_leave_type IN ('ANNUAL', 'HALF_DAY', 'AM_HALF', 'PM_HALF', 'GROUP') THEN
    UPDATE employees
    SET remaining_leaves = remaining_leaves + v_days_used
    WHERE id = v_employee_id;
  END IF;

  -- Cancel pending calendar outbox event
  UPDATE outbox_events
  SET status = 'DONE', processed_at = now()
  WHERE idempotency_key = 'CALENDAR_INSERT:leave:' || p_request_id
    AND status = 'PENDING';
END;
$$;

-- ─── Fix 2: cancel_own_leave_request ─────────────────────────────────────────
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

  UPDATE leave_requests SET status = 'CANCELLED', updated_at = now()
  WHERE id = p_request_id;

  UPDATE leave_approval_steps SET status = 'CANCELLED'
  WHERE leave_request_id = p_request_id AND status IN ('PENDING', 'WAITING');

  -- Restore deducted leave balance
  IF v_leave_type IN ('ANNUAL', 'HALF_DAY', 'AM_HALF', 'PM_HALF', 'GROUP') THEN
    UPDATE employees SET remaining_leaves = remaining_leaves + v_days_used
    WHERE id = v_emp_id;
  END IF;

  -- Cancel pending calendar outbox event
  UPDATE outbox_events
  SET status = 'DONE', processed_at = now()
  WHERE idempotency_key = 'CALENDAR_INSERT:leave:' || p_request_id
    AND status = 'PENDING';
END;
$$;

-- ─── Fix 3: approve_supply_step — add FOR UPDATE ──────────────────────────────
CREATE OR REPLACE FUNCTION approve_supply_step(
  p_request_id UUID,
  p_approved   BOOLEAN,
  p_comment    TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_employee_id UUID;
  v_step        supply_approval_steps%ROWTYPE;
  v_next_step   supply_approval_steps%ROWTYPE;
BEGIN
  SELECT id INTO v_employee_id FROM employees
  WHERE auth_user_id = auth.uid() AND is_active = true;

  IF v_employee_id IS NULL THEN RAISE EXCEPTION 'Employee not found'; END IF;

  -- Lock parent request to prevent concurrent approvals
  PERFORM 1 FROM supply_requests WHERE id = p_request_id AND status = 'PENDING' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Supply request not found or already processed'; END IF;

  SELECT * INTO v_step FROM supply_approval_steps
  WHERE supply_request_id = p_request_id
    AND approver_id = v_employee_id
    AND status = 'PENDING'
  ORDER BY step_order LIMIT 1
  FOR UPDATE;

  IF v_step.id IS NULL THEN RAISE EXCEPTION 'No pending step found'; END IF;

  UPDATE supply_approval_steps
  SET status = CASE WHEN p_approved THEN 'APPROVED' ELSE 'REJECTED' END,
      comment = p_comment, acted_at = now()
  WHERE id = v_step.id;

  IF p_approved THEN
    SELECT * INTO v_next_step FROM supply_approval_steps
    WHERE supply_request_id = p_request_id
      AND step_order = v_step.step_order + 1
      AND status = 'WAITING';
    IF v_next_step.id IS NOT NULL THEN
      UPDATE supply_approval_steps SET status = 'PENDING' WHERE id = v_next_step.id;
    ELSE
      UPDATE supply_requests SET status = 'APPROVED' WHERE id = p_request_id;
    END IF;
  ELSE
    UPDATE supply_requests SET status = 'REJECTED' WHERE id = p_request_id;
    UPDATE supply_approval_steps
    SET status = 'REJECTED'
    WHERE supply_request_id = p_request_id AND status = 'WAITING';
  END IF;
END;
$$;
