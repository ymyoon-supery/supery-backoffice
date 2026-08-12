-- 075_cancel_expense_approval.sql
-- Admin-only: revert an APPROVED expense report to PENDING (only if not yet paid)

ALTER TABLE expense_reports
  ADD COLUMN IF NOT EXISTS cancel_comment TEXT;

CREATE OR REPLACE FUNCTION admin_cancel_expense_approval(
  p_report_id UUID,
  p_comment   TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_admin_id       UUID;
  v_status         TEXT;
  v_payment_status TEXT;
BEGIN
  SELECT id INTO v_admin_id
  FROM employees
  WHERE auth_user_id = auth.uid()
    AND role = 'ADMIN'
    AND is_active = true;

  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: admin only';
  END IF;

  SELECT status, payment_status
  INTO v_status, v_payment_status
  FROM expense_reports
  WHERE id = p_report_id
  FOR UPDATE;

  IF v_status IS NULL THEN
    RAISE EXCEPTION '지출결의서를 찾을 수 없습니다.';
  END IF;

  IF v_status != 'APPROVED' THEN
    RAISE EXCEPTION '승인된 지출결의서만 승인취소 할 수 있습니다.';
  END IF;

  IF v_payment_status != 'PENDING_PAYMENT' THEN
    RAISE EXCEPTION '이미 지급 처리된 지출결의서는 승인취소 할 수 없습니다.';
  END IF;

  UPDATE expense_reports
  SET
    status         = 'PENDING',
    cancel_comment = p_comment,
    updated_at     = now()
  WHERE id = p_report_id;

  -- step1 → PENDING, step2+ → WAITING, clear acted info
  UPDATE expense_approval_steps
  SET
    status   = CASE WHEN step_order = 1 THEN 'PENDING' ELSE 'WAITING' END,
    comment  = NULL,
    acted_at = NULL
  WHERE expense_report_id = p_report_id;
END;
$$;
