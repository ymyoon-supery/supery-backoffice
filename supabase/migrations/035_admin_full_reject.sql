-- ============================================================
-- 035_admin_full_reject.sql
-- 관리자가 팀장 결재 전 항목을 직접 반려하는 RPC
-- ============================================================

CREATE OR REPLACE FUNCTION admin_full_reject_leave(
  p_request_id UUID,
  p_comment    TEXT DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_admin_id UUID;
BEGIN
  SELECT id INTO v_admin_id
  FROM employees
  WHERE auth_user_id = auth.uid() AND role = 'ADMIN';

  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE leave_approval_steps
  SET status = 'REJECTED', comment = p_comment, acted_at = NOW()
  WHERE leave_request_id = p_request_id
    AND status IN ('PENDING', 'WAITING');

  UPDATE leave_requests
  SET status = 'REJECTED'
  WHERE id = p_request_id;
END;
$$;

CREATE OR REPLACE FUNCTION admin_full_reject_expense(
  p_report_id UUID,
  p_comment   TEXT DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_admin_id UUID;
BEGIN
  SELECT id INTO v_admin_id
  FROM employees
  WHERE auth_user_id = auth.uid() AND role = 'ADMIN';

  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE expense_approval_steps
  SET status = 'REJECTED', comment = p_comment, acted_at = NOW()
  WHERE expense_report_id = p_report_id
    AND status IN ('PENDING', 'WAITING');

  UPDATE expense_reports
  SET status = 'REJECTED'
  WHERE id = p_report_id;
END;
$$;
