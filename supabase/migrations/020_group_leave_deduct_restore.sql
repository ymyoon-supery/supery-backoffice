-- GROUP(공동연차) 다시 연차 차감 대상으로 복구
-- COMP(보상휴가), SICK, OTHER 는 차감 없음 유지

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
BEGIN
  SELECT id, position, department_id
  INTO v_employee_id, v_position, v_dept_id
  FROM employees
  WHERE auth_user_id = auth.uid() AND is_active = true
  FOR UPDATE;

  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'Employee not found';
  END IF;

  -- ANNUAL, HALF_DAY, AM_HALF, PM_HALF, GROUP 은 잔여 연차에서 차감
  -- COMP, SICK, OTHER 는 차감 없음
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

  -- 팀장은 바로 ADMIN에게 결재, 팀원은 팀장 → ADMIN
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
    INSERT INTO leave_approval_steps (leave_request_id, approver_id, step_order)
    VALUES (v_request_id, v_manager_id, 1);
    IF v_admin_id IS NOT NULL AND v_admin_id != v_manager_id THEN
      INSERT INTO leave_approval_steps (leave_request_id, approver_id, step_order)
      VALUES (v_request_id, v_admin_id, 2);
    END IF;
  ELSIF v_admin_id IS NOT NULL THEN
    INSERT INTO leave_approval_steps (leave_request_id, approver_id, step_order)
    VALUES (v_request_id, v_admin_id, 1);
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
