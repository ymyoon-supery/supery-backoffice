-- 087_admin_cancel_leave_approval.sql
-- Admin-only: cancel an APPROVED leave request and restore remaining_leaves

ALTER TABLE leave_requests
  ADD COLUMN IF NOT EXISTS cancel_comment TEXT;

CREATE OR REPLACE FUNCTION admin_cancel_leave_approval(
  p_request_id UUID,
  p_comment    TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_admin_id    UUID;
  v_status      TEXT;
  v_leave_type  TEXT;
  v_days_used   NUMERIC;
  v_employee_id UUID;
  v_gcal_id     TEXT;
BEGIN
  SELECT id INTO v_admin_id
  FROM employees
  WHERE auth_user_id = auth.uid()
    AND role = 'ADMIN'
    AND is_active = true;

  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: admin only';
  END IF;

  SELECT status, leave_type, days_used, employee_id, google_calendar_event_id
  INTO v_status, v_leave_type, v_days_used, v_employee_id, v_gcal_id
  FROM leave_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF v_status IS NULL THEN
    RAISE EXCEPTION '연차 신청을 찾을 수 없습니다.';
  END IF;

  IF v_status != 'APPROVED' THEN
    RAISE EXCEPTION '승인된 연차 신청만 취소할 수 있습니다.';
  END IF;

  UPDATE leave_requests
  SET
    status         = 'CANCELLED',
    cancel_comment = p_comment,
    updated_at     = now()
  WHERE id = p_request_id;

  UPDATE leave_approval_steps
  SET status = 'CANCELLED'
  WHERE leave_request_id = p_request_id
    AND status IN ('APPROVED', 'PENDING', 'WAITING');

  -- 차감 유형만 복원 (SICK, OTHER는 차감하지 않았으므로 복원 불필요)
  IF v_leave_type IN ('ANNUAL', 'HALF_DAY', 'AM_HALF', 'PM_HALF', 'GROUP') THEN
    UPDATE employees
    SET remaining_leaves = remaining_leaves + v_days_used
    WHERE id = v_employee_id;
  END IF;

  -- 구글 캘린더 이벤트 삭제 큐 삽입
  IF v_gcal_id IS NOT NULL THEN
    INSERT INTO outbox_events (idempotency_key, event_type, payload)
    VALUES (
      'CALENDAR_DELETE:leave:' || p_request_id,
      'CALENDAR_DELETE',
      jsonb_build_object(
        'employee_id', v_employee_id,
        'google_event_id', v_gcal_id
      )
    )
    ON CONFLICT (idempotency_key) DO NOTHING;
  END IF;
END;
$$;
