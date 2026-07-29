-- 065_fix_admin_full_approve_expense_race.sql
--
-- Root cause: admin_full_approve_expense (migration 033) updates step 2 only
-- WHERE status = 'WAITING'. When the 팀장 approves step 1 concurrently, step 2
-- transitions WAITING → PENDING before the admin clicks 전결. The step 2 UPDATE
-- finds no rows (status is now PENDING, not WAITING), so the expense is set to
-- APPROVED but admin's step 2 remains PENDING — an orphaned state.
-- On next page load the admin sees the orphaned PENDING step; any approve/reject
-- attempt hits "Expense report not found or already processed" because the
-- expense is already APPROVED.
--
-- Fix: update step 2 where status IN ('WAITING', 'PENDING').
-- Cleanup: resolve any pre-existing orphaned PENDING steps on finalized expenses.

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

  -- step 1 (팀장): 전결 처리. No-op if 팀장 already approved concurrently.
  UPDATE expense_approval_steps
  SET status = 'APPROVED', comment = '전결', acted_at = now()
  WHERE expense_report_id = p_report_id AND step_order = 1 AND status = 'PENDING';

  -- step 2 (admin): approve regardless of WAITING or PENDING.
  -- WAITING  = normal 전결 path (팀장 not yet approved)
  -- PENDING  = 팀장 approved concurrently, step was activated before admin clicked
  UPDATE expense_approval_steps
  SET status = 'APPROVED', acted_at = now()
  WHERE expense_report_id = p_report_id AND step_order = 2 AND status IN ('WAITING', 'PENDING');

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

-- Cleanup: mark orphaned PENDING approval steps on already-finalized expense_reports.
-- These were left behind by the pre-fix version of admin_full_approve_expense.
UPDATE expense_approval_steps eas
SET
  status    = CASE er.status
                WHEN 'APPROVED'  THEN 'APPROVED'
                WHEN 'REJECTED'  THEN 'REJECTED'
                WHEN 'CANCELLED' THEN 'CANCELLED'
              END,
  acted_at  = COALESCE(eas.acted_at, NOW())
FROM expense_reports er
WHERE eas.expense_report_id = er.id
  AND eas.status = 'PENDING'
  AND er.status IN ('APPROVED', 'REJECTED', 'CANCELLED');
