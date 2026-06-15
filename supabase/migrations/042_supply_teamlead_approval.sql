-- 1. Allow approvers to view supply requests they need to approve
CREATE POLICY "approver_view_supply" ON supply_requests
  FOR SELECT USING (
    id IN (
      SELECT supply_request_id FROM supply_approval_steps
      WHERE approver_id = (SELECT id FROM employees WHERE auth_user_id = auth.uid())
    )
  );

CREATE POLICY "approver_view_supply_items" ON supply_request_items
  FOR SELECT USING (
    request_id IN (
      SELECT supply_request_id FROM supply_approval_steps
      WHERE approver_id = (SELECT id FROM employees WHERE auth_user_id = auth.uid())
    )
  );

-- 2. Update submit_supply_request to include team lead as step 1
CREATE OR REPLACE FUNCTION submit_supply_request(
  p_items JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_employee_id       UUID;
  v_request_id        UUID;
  v_supply_manager_id UUID;
  v_admin_id          UUID;
  v_team_lead_id      UUID;
  v_position          TEXT;
  v_dept_id           UUID;
  v_item              JSONB;
  v_sort              INTEGER := 0;
  v_step              INTEGER := 1;
BEGIN
  SELECT id, position, department_id
  INTO v_employee_id, v_position, v_dept_id
  FROM employees WHERE auth_user_id = auth.uid() AND is_active = true;
  IF v_employee_id IS NULL THEN RAISE EXCEPTION 'Employee not found'; END IF;

  INSERT INTO supply_requests (employee_id) VALUES (v_employee_id) RETURNING id INTO v_request_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    INSERT INTO supply_request_items (request_id, category, description, estimated_amount, note, sort_order)
    VALUES (
      v_request_id,
      v_item->>'category',
      v_item->>'description',
      CASE WHEN v_item->>'estimated_amount' IS NOT NULL AND v_item->>'estimated_amount' != 'null'
           THEN (v_item->>'estimated_amount')::INTEGER ELSE NULL END,
      v_item->>'note',
      v_sort
    );
    v_sort := v_sort + 1;
  END LOOP;

  -- Find team lead (skip if submitter is already team lead)
  IF v_position != '팀장' AND v_dept_id IS NOT NULL THEN
    SELECT id INTO v_team_lead_id
    FROM employees
    WHERE department_id = v_dept_id AND position = '팀장' AND is_active = true AND id != v_employee_id
    LIMIT 1;
  END IF;

  SELECT supply_manager_id INTO v_supply_manager_id FROM company_settings LIMIT 1;
  SELECT id INTO v_admin_id FROM employees WHERE role = 'ADMIN' AND is_active = true ORDER BY created_at LIMIT 1;

  -- Step 1: team lead (if exists and not submitter)
  IF v_team_lead_id IS NOT NULL THEN
    INSERT INTO supply_approval_steps (supply_request_id, approver_id, step_order, status)
    VALUES (v_request_id, v_team_lead_id, v_step, 'PENDING');
    v_step := v_step + 1;
  END IF;

  -- Next: supply manager (if set, and different from team lead and submitter)
  IF v_supply_manager_id IS NOT NULL
     AND v_supply_manager_id != v_employee_id
     AND v_supply_manager_id IS DISTINCT FROM v_team_lead_id
  THEN
    INSERT INTO supply_approval_steps (supply_request_id, approver_id, step_order, status)
    VALUES (v_request_id, v_supply_manager_id, v_step,
            CASE WHEN v_step = 1 THEN 'PENDING' ELSE 'WAITING' END);
    v_step := v_step + 1;
  END IF;

  -- Last: admin (if different from all prior approvers)
  IF v_admin_id IS NOT NULL
     AND v_admin_id IS DISTINCT FROM v_supply_manager_id
     AND v_admin_id IS DISTINCT FROM v_team_lead_id
  THEN
    INSERT INTO supply_approval_steps (supply_request_id, approver_id, step_order, status)
    VALUES (v_request_id, v_admin_id, v_step,
            CASE WHEN v_step = 1 THEN 'PENDING' ELSE 'WAITING' END);
  END IF;

  RETURN v_request_id;
END;
$$;
