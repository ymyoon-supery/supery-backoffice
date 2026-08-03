-- 068_fix_supply_reject_propagate_comment.sql
--
-- Fix: approve_supply_step — when rejecting, propagate rejection comment to
-- previously APPROVED steps so that prior approvers (e.g. team lead at step 1)
-- can see the rejection reason in their 결재완료 list.
--
-- Before this fix: only WAITING steps were updated to REJECTED (without comment).
-- APPROVED steps kept status=APPROVED and comment=null, so team leads who had
-- already approved saw "승인" with no rejection reason even after the request
-- was ultimately rejected by a later approver.

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

  -- Update current step
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

    -- WAITING steps: mark REJECTED with comment (they never acted)
    UPDATE supply_approval_steps
    SET status = 'REJECTED', comment = p_comment, acted_at = now()
    WHERE supply_request_id = p_request_id AND status = 'WAITING';

    -- APPROVED steps: propagate rejection reason so prior approvers can see it
    -- (keep original acted_at — they did act, just earlier in the chain)
    UPDATE supply_approval_steps
    SET status = 'REJECTED', comment = p_comment
    WHERE supply_request_id = p_request_id AND status = 'APPROVED';
  END IF;
END;
$$;
