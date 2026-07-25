-- 063_fix_admin_reject_expense_and_active_guard.sql
--
-- Fix 1: admin_full_reject_expense (migration 035) — was missing search_path,
--         FOR UPDATE, status guard, updated_at, is_active check, and CHAT_NOTIFY
-- Fix 2: admin_full_reject_leave (migration 062) — missing is_active = true guard
--         (a deactivated ADMIN could still reject leaves)

-- ─── Fix 1: admin_full_reject_expense ────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_full_reject_expense(
  p_report_id UUID,
  p_comment   TEXT DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_admin_id UUID;
BEGIN
  SELECT id INTO v_admin_id FROM employees
  WHERE auth_user_id = auth.uid() AND role = 'ADMIN' AND is_active = true;
  IF v_admin_id IS NULL THEN RAISE EXCEPTION 'Not authorized'; END IF;

  PERFORM 1 FROM expense_reports
  WHERE id = p_report_id AND status = 'PENDING'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense report not found or already processed';
  END IF;

  UPDATE expense_approval_steps
  SET status = 'REJECTED', comment = p_comment, acted_at = NOW()
  WHERE expense_report_id = p_report_id AND status IN ('PENDING', 'WAITING');

  UPDATE expense_reports
  SET status = 'REJECTED', updated_at = now()
  WHERE id = p_report_id;

  INSERT INTO outbox_events (idempotency_key, event_type, payload)
  VALUES (
    'CHAT_NOTIFY:expense_rejected:' || p_report_id,
    'CHAT_NOTIFY',
    jsonb_build_object('report_id', p_report_id, 'type', 'expense_rejected')
  )
  ON CONFLICT (idempotency_key) DO NOTHING;
END;
$$;

-- ─── Fix 2: admin_full_reject_leave — add is_active guard ────────────────────
CREATE OR REPLACE FUNCTION admin_full_reject_leave(
  p_request_id UUID,
  p_comment    TEXT DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_admin_id    UUID;
  v_employee_id UUID;
  v_days_used   NUMERIC;
  v_leave_type  TEXT;
  v_gcal_id     TEXT;
BEGIN
  SELECT id INTO v_admin_id FROM employees
  WHERE auth_user_id = auth.uid() AND role = 'ADMIN' AND is_active = true;
  IF v_admin_id IS NULL THEN RAISE EXCEPTION 'Not authorized'; END IF;

  SELECT employee_id, days_used, leave_type, google_calendar_event_id
  INTO v_employee_id, v_days_used, v_leave_type, v_gcal_id
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

  IF v_leave_type IN ('ANNUAL', 'HALF_DAY', 'AM_HALF', 'PM_HALF', 'GROUP') THEN
    UPDATE employees
    SET remaining_leaves = remaining_leaves + v_days_used
    WHERE id = v_employee_id;
  END IF;

  IF v_gcal_id IS NOT NULL THEN
    INSERT INTO outbox_events (idempotency_key, event_type, payload)
    VALUES (
      'CALENDAR_DELETE:leave:' || p_request_id,
      'CALENDAR_DELETE',
      jsonb_build_object('employee_id', v_employee_id, 'google_event_id', v_gcal_id)
    )
    ON CONFLICT (idempotency_key) DO NOTHING;
  ELSE
    UPDATE outbox_events
    SET status = 'DONE', processed_at = now()
    WHERE idempotency_key = 'CALENDAR_INSERT:leave:' || p_request_id
      AND status = 'PENDING';
  END IF;

  INSERT INTO outbox_events (idempotency_key, event_type, payload)
  VALUES (
    'CHAT_NOTIFY:leave_rejected:' || p_request_id,
    'CHAT_NOTIFY',
    jsonb_build_object('request_id', p_request_id, 'type', 'leave_rejected')
  )
  ON CONFLICT (idempotency_key) DO NOTHING;
END;
$$;
