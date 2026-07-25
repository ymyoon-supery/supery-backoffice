-- 062_leave_calendar_event_id_and_reject_notify.sql
--
-- 1. Add google_calendar_event_id to leave_requests so CALENDAR_DELETE can target
--    the exact Google Calendar event when a leave is rejected or cancelled.
-- 2. Update admin_full_reject_leave to enqueue CALENDAR_DELETE + CHAT_NOTIFY (rejection)
-- 3. Update cancel_own_leave_request to enqueue CALENDAR_DELETE if event ID is stored

ALTER TABLE leave_requests
  ADD COLUMN IF NOT EXISTS google_calendar_event_id TEXT;

-- ─── admin_full_reject_leave ──────────────────────────────────────────────────
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
  WHERE auth_user_id = auth.uid() AND role = 'ADMIN';
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

  -- Cancel pending calendar creation or delete already-created event
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

  -- Notify employee of rejection via chat
  INSERT INTO outbox_events (idempotency_key, event_type, payload)
  VALUES (
    'CHAT_NOTIFY:leave_rejected:' || p_request_id,
    'CHAT_NOTIFY',
    jsonb_build_object('request_id', p_request_id, 'type', 'leave_rejected')
  )
  ON CONFLICT (idempotency_key) DO NOTHING;
END;
$$;

-- ─── cancel_own_leave_request ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION cancel_own_leave_request(p_request_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_emp_id     UUID;
  v_days_used  NUMERIC;
  v_leave_type TEXT;
  v_gcal_id    TEXT;
BEGIN
  SELECT employee_id, days_used, leave_type, google_calendar_event_id
  INTO v_emp_id, v_days_used, v_leave_type, v_gcal_id
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

  IF v_leave_type IN ('ANNUAL', 'HALF_DAY', 'AM_HALF', 'PM_HALF', 'GROUP') THEN
    UPDATE employees SET remaining_leaves = remaining_leaves + v_days_used
    WHERE id = v_emp_id;
  END IF;

  IF v_gcal_id IS NOT NULL THEN
    INSERT INTO outbox_events (idempotency_key, event_type, payload)
    VALUES (
      'CALENDAR_DELETE:leave:' || p_request_id,
      'CALENDAR_DELETE',
      jsonb_build_object('employee_id', v_emp_id, 'google_event_id', v_gcal_id)
    )
    ON CONFLICT (idempotency_key) DO NOTHING;
  ELSE
    UPDATE outbox_events
    SET status = 'DONE', processed_at = now()
    WHERE idempotency_key = 'CALENDAR_INSERT:leave:' || p_request_id
      AND status = 'PENDING';
  END IF;
END;
$$;
