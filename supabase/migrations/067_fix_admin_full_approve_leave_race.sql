-- 067_fix_admin_full_approve_leave_race.sql
--
-- Root cause: admin_full_approve_leave (migration 033) updates step 2 only
-- WHERE status = 'WAITING'. When 팀장 approves step 1 concurrently, step 2
-- transitions WAITING → PENDING before admin clicks 전결. The step 2 UPDATE
-- finds no rows (status is now PENDING, not WAITING), so leave_request is set
-- to APPROVED but admin's step 2 remains PENDING — an orphaned state.
-- On next page load admin sees orphaned PENDING step; approve/reject both hit
-- "Leave request not found or already processed" because leave is already APPROVED.
--
-- Fix: update step 2 where status IN ('WAITING', 'PENDING').
-- Cleanup: resolve any pre-existing orphaned PENDING steps on finalized leaves.

CREATE OR REPLACE FUNCTION admin_full_approve_leave(p_request_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $func$
DECLARE
  v_admin_id    UUID;
  v_employee_id UUID;
BEGIN
  SELECT id INTO v_admin_id FROM employees
  WHERE auth_user_id = auth.uid() AND role = 'ADMIN' AND is_active = true;
  IF v_admin_id IS NULL THEN RAISE EXCEPTION 'Not authorized'; END IF;

  SELECT employee_id INTO v_employee_id
  FROM leave_requests
  WHERE id = p_request_id AND status = 'PENDING'
  FOR UPDATE;

  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'Leave request not found or already processed';
  END IF;

  -- step 1 (팀장): 전결 처리. No-op if 팀장 already approved concurrently.
  UPDATE leave_approval_steps
  SET status = 'APPROVED', comment = '전결', acted_at = now()
  WHERE leave_request_id = p_request_id AND step_order = 1 AND status = 'PENDING';

  -- step 2 (admin): approve regardless of WAITING or PENDING.
  -- WAITING = normal 전결 path (팀장 not yet approved)
  -- PENDING = 팀장 approved concurrently, step was activated before admin clicked
  UPDATE leave_approval_steps
  SET status = 'APPROVED', acted_at = now()
  WHERE leave_request_id = p_request_id AND step_order = 2 AND status IN ('WAITING', 'PENDING');

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
$func$;

-- Cleanup: mark orphaned PENDING approval steps on already-finalized leave_requests.
UPDATE leave_approval_steps las
SET
  status   = CASE lr.status
               WHEN 'APPROVED'  THEN 'APPROVED'
               WHEN 'REJECTED'  THEN 'REJECTED'
               WHEN 'CANCELLED' THEN 'CANCELLED'
             END,
  acted_at = COALESCE(las.acted_at, NOW())
FROM leave_requests lr
WHERE las.leave_request_id = lr.id
  AND las.status = 'PENDING'
  AND lr.status IN ('APPROVED', 'REJECTED', 'CANCELLED');
