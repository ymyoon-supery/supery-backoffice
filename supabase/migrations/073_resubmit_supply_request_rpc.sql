-- 073_resubmit_supply_request_rpc.sql
--
-- Allows an employee to modify and resubmit a REJECTED supply request.
-- Updates items in-place, resets status to PENDING, and rebuilds approval steps.

CREATE OR REPLACE FUNCTION resubmit_supply_request(
  p_request_id UUID,
  p_items JSONB
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_employee_id UUID;
  v_supply_manager_id UUID;
  v_admin_id UUID;
  v_item JSONB;
  v_sort INTEGER := 0;
BEGIN
  SELECT employee_id INTO v_employee_id
  FROM supply_requests
  WHERE id = p_request_id
    AND status = 'REJECTED'
    AND employee_id = (
      SELECT id FROM employees WHERE auth_user_id = auth.uid() AND is_active = true
    )
  FOR UPDATE;

  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION '재신청할 수 없는 신청입니다.';
  END IF;

  UPDATE supply_requests
  SET status = 'PENDING', updated_at = now()
  WHERE id = p_request_id;

  DELETE FROM supply_request_items WHERE request_id = p_request_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    INSERT INTO supply_request_items (request_id, category, description, estimated_amount, note, sort_order)
    VALUES (
      p_request_id,
      v_item->>'category',
      v_item->>'description',
      CASE WHEN v_item->>'estimated_amount' IS NOT NULL AND v_item->>'estimated_amount' != 'null'
           THEN (v_item->>'estimated_amount')::INTEGER ELSE NULL END,
      v_item->>'note',
      v_sort
    );
    v_sort := v_sort + 1;
  END LOOP;

  DELETE FROM supply_approval_steps WHERE supply_request_id = p_request_id;

  SELECT supply_manager_id INTO v_supply_manager_id FROM company_settings LIMIT 1;
  SELECT id INTO v_admin_id FROM employees WHERE role = 'ADMIN' AND is_active = true ORDER BY created_at LIMIT 1;

  IF v_supply_manager_id IS NOT NULL AND v_supply_manager_id != v_employee_id THEN
    INSERT INTO supply_approval_steps (supply_request_id, approver_id, step_order, status)
    VALUES (p_request_id, v_supply_manager_id, 1, 'PENDING');
    IF v_admin_id IS NOT NULL AND v_admin_id != v_supply_manager_id THEN
      INSERT INTO supply_approval_steps (supply_request_id, approver_id, step_order, status)
      VALUES (p_request_id, v_admin_id, 2, 'WAITING');
    END IF;
  ELSIF v_admin_id IS NOT NULL THEN
    INSERT INTO supply_approval_steps (supply_request_id, approver_id, step_order, status)
    VALUES (p_request_id, v_admin_id, 1, 'PENDING');
  END IF;
END;
$$;
