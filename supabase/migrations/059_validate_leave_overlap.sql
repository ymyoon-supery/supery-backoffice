-- 059_validate_leave_overlap.sql
--
-- Add overlap check to validate_and_submit_leave.
-- Blocks submission if employee already has a PENDING or APPROVED leave
-- overlapping the requested dates, with one exception: AM_HALF + PM_HALF
-- on the exact same day are complementary and allowed together.

CREATE OR REPLACE FUNCTION validate_and_submit_leave(
  p_leave_type    TEXT,
  p_start_date    DATE,
  p_end_date      DATE,
  p_days_used     NUMERIC,
  p_reason        TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_employee_id   UUID;
  v_request_id    UUID;
  v_manager_id    UUID;
  v_admin_id      UUID;
  v_position      TEXT;
  v_dept_id       UUID;
  v_overlap_type  TEXT;
  v_overlap_start DATE;
  v_overlap_end   DATE;
BEGIN
  SELECT id, position, department_id
  INTO v_employee_id, v_position, v_dept_id
  FROM employees
  WHERE auth_user_id = auth.uid() AND is_active = true
  FOR UPDATE;

  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'Employee not found';
  END IF;

  -- Overlap check: reject if any existing PENDING/APPROVED leave overlaps,
  -- unless it is the complementary half-day (AM+PM or PM+AM on the same day).
  SELECT leave_type, start_date, end_date
  INTO v_overlap_type, v_overlap_start, v_overlap_end
  FROM leave_requests
  WHERE employee_id = v_employee_id
    AND status IN ('PENDING', 'APPROVED')
    AND start_date <= p_end_date
    AND end_date   >= p_start_date
    AND NOT (
      -- Allow AM_HALF + PM_HALF combo on the exact same single day
      p_start_date = p_end_date
      AND start_date = end_date
      AND p_start_date = start_date
      AND (
        (p_leave_type = 'AM_HALF' AND leave_type = 'PM_HALF') OR
        (p_leave_type = 'PM_HALF' AND leave_type = 'AM_HALF')
      )
    )
  LIMIT 1;

  IF v_overlap_start IS NOT NULL THEN
    IF v_overlap_start = v_overlap_end THEN
      RAISE EXCEPTION '해당 날짜(%)에 이미 신청된 휴가가 있습니다.', v_overlap_start;
    ELSE
      RAISE EXCEPTION '해당 기간(%~%)에 이미 신청된 휴가가 있습니다.', v_overlap_start, v_overlap_end;
    END IF;
  END IF;

  IF p_leave_type IN ('ANNUAL', 'HALF_DAY', 'AM_HALF', 'PM_HALF', 'GROUP') THEN
    PERFORM 1 FROM employees
    WHERE id = v_employee_id AND remaining_leaves >= p_days_used;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Insufficient leave balance';
    END IF;
    UPDATE employees
    SET remaining_leaves = remaining_leaves - p_days_used
    WHERE id = v_employee_id;
  END IF;

  INSERT INTO leave_requests (
    employee_id, leave_type, start_date, end_date, days_used, reason, status
  ) VALUES (
    v_employee_id, p_leave_type, p_start_date, p_end_date, p_days_used, p_reason, 'PENDING'
  )
  RETURNING id INTO v_request_id;

  -- 팀장은 바로 ADMIN 결재, 팀원은 팀장(step1 PENDING) → ADMIN(step2 WAITING)
  IF v_position = '팀장' THEN
    v_manager_id := NULL;
  ELSIF v_dept_id IS NOT NULL THEN
    SELECT id INTO v_manager_id
    FROM employees
    WHERE department_id = v_dept_id
      AND position = '팀장'
      AND is_active = true
      AND id != v_employee_id
    LIMIT 1;
  END IF;

  SELECT id INTO v_admin_id
  FROM employees
  WHERE role = 'ADMIN' AND is_active = true
  ORDER BY created_at
  LIMIT 1;

  IF v_manager_id IS NOT NULL THEN
    INSERT INTO leave_approval_steps (leave_request_id, approver_id, step_order, status)
    VALUES (v_request_id, v_manager_id, 1, 'PENDING');
    IF v_admin_id IS NOT NULL AND v_admin_id != v_manager_id THEN
      INSERT INTO leave_approval_steps (leave_request_id, approver_id, step_order, status)
      VALUES (v_request_id, v_admin_id, 2, 'WAITING');
    END IF;
  ELSIF v_admin_id IS NOT NULL THEN
    INSERT INTO leave_approval_steps (leave_request_id, approver_id, step_order, status)
    VALUES (v_request_id, v_admin_id, 1, 'PENDING');
  END IF;

  INSERT INTO outbox_events (idempotency_key, event_type, payload)
  VALUES (
    'CALENDAR_INSERT:leave:' || v_request_id,
    'CALENDAR_INSERT',
    jsonb_build_object(
      'request_id', v_request_id, 'employee_id', v_employee_id,
      'start_date', p_start_date, 'end_date', p_end_date, 'leave_type', p_leave_type
    )
  )
  ON CONFLICT (idempotency_key) DO NOTHING;

  RETURN v_request_id;
END;
$$;
