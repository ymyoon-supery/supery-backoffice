-- 071_cancel_supply_document_rpcs.sql
--
-- Move supply and document cancellation from TS-side direct updates into
-- SECURITY DEFINER RPCs with FOR UPDATE locks, mirroring the pattern
-- established in 069_block_cancel_if_step_approved.sql for leave/expense.
--
-- Problems fixed:
--   - TOCTOU race: a step could be approved between the "check APPROVED" query
--     and the "UPDATE status=CANCELLED" statement in the old TS code.
--   - Missing atomicity: if the process died between the two TS updates, the
--     request would be CANCELLED but steps would remain PENDING/WAITING.
--   - Missing updated_at: direct UPDATE bypassed the updated_at timestamp.

-- ─── cancel_own_supply_request ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION cancel_own_supply_request(p_request_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_emp_id UUID;
BEGIN
  SELECT employee_id INTO v_emp_id
  FROM supply_requests
  WHERE id = p_request_id
    AND status = 'PENDING'
    AND employee_id = (
      SELECT id FROM employees WHERE auth_user_id = auth.uid() AND is_active = true
    )
  FOR UPDATE;

  IF v_emp_id IS NULL THEN
    RAISE EXCEPTION '취소할 수 없는 신청입니다.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM supply_approval_steps
    WHERE supply_request_id = p_request_id AND status = 'APPROVED'
  ) THEN
    RAISE EXCEPTION '이미 결재가 진행된 신청은 취소할 수 없습니다. 담당자에게 반려를 요청해 주세요.';
  END IF;

  UPDATE supply_requests
  SET status = 'CANCELLED', updated_at = now()
  WHERE id = p_request_id;

  UPDATE supply_approval_steps
  SET status = 'CANCELLED'
  WHERE supply_request_id = p_request_id
    AND status IN ('PENDING', 'WAITING');
END;
$$;

-- ─── cancel_own_document_request ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION cancel_own_document_request(p_request_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_emp_id UUID;
BEGIN
  SELECT employee_id INTO v_emp_id
  FROM document_requests
  WHERE id = p_request_id
    AND status = 'PENDING'
    AND employee_id = (
      SELECT id FROM employees WHERE auth_user_id = auth.uid() AND is_active = true
    )
  FOR UPDATE;

  IF v_emp_id IS NULL THEN
    RAISE EXCEPTION '취소할 수 없는 신청입니다.';
  END IF;

  UPDATE document_requests
  SET status = 'CANCELLED', updated_at = now()
  WHERE id = p_request_id;
END;
$$;
