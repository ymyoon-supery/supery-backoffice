-- Add supply_manager_id to company_settings
ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS supply_manager_id UUID REFERENCES employees(id);

-- Simple document requests (재직증명서, 원천징수영수증)
CREATE TABLE document_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL CHECK (doc_type IN ('EMPLOYMENT_CERT', 'WITHHOLDING_RECEIPT')),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'COMPLETED')),
  completed_by UUID REFERENCES employees(id),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE document_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "employee_view_own" ON document_requests
  FOR SELECT USING (employee_id = (SELECT id FROM employees WHERE auth_user_id = auth.uid()));
CREATE POLICY "employee_insert" ON document_requests
  FOR INSERT WITH CHECK (employee_id = (SELECT id FROM employees WHERE auth_user_id = auth.uid()));
CREATE POLICY "admin_all" ON document_requests
  FOR ALL USING ((SELECT role FROM employees WHERE auth_user_id = auth.uid()) = 'ADMIN');

-- Supply / equipment requests (비품, 소모품, 소프트웨어, 기타)
CREATE TABLE supply_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE supply_request_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES supply_requests(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('EQUIPMENT', 'CONSUMABLE', 'SOFTWARE', 'OTHER')),
  description TEXT NOT NULL,
  estimated_amount INTEGER,
  note TEXT,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE supply_approval_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supply_request_id UUID NOT NULL REFERENCES supply_requests(id) ON DELETE CASCADE,
  approver_id UUID NOT NULL REFERENCES employees(id),
  step_order INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'WAITING')),
  comment TEXT,
  acted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE supply_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE supply_request_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE supply_approval_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "employee_view_own_supply" ON supply_requests
  FOR SELECT USING (employee_id = (SELECT id FROM employees WHERE auth_user_id = auth.uid()));
CREATE POLICY "employee_insert_supply" ON supply_requests
  FOR INSERT WITH CHECK (employee_id = (SELECT id FROM employees WHERE auth_user_id = auth.uid()));
CREATE POLICY "admin_all_supply" ON supply_requests
  FOR ALL USING ((SELECT role FROM employees WHERE auth_user_id = auth.uid()) = 'ADMIN');

CREATE POLICY "view_own_supply_items" ON supply_request_items
  FOR SELECT USING (
    request_id IN (SELECT id FROM supply_requests WHERE employee_id = (SELECT id FROM employees WHERE auth_user_id = auth.uid()))
    OR (SELECT role FROM employees WHERE auth_user_id = auth.uid()) = 'ADMIN'
  );
CREATE POLICY "insert_own_supply_items" ON supply_request_items
  FOR INSERT WITH CHECK (
    request_id IN (SELECT id FROM supply_requests WHERE employee_id = (SELECT id FROM employees WHERE auth_user_id = auth.uid()))
  );

CREATE POLICY "view_supply_steps" ON supply_approval_steps
  FOR SELECT USING (
    approver_id = (SELECT id FROM employees WHERE auth_user_id = auth.uid())
    OR supply_request_id IN (SELECT id FROM supply_requests WHERE employee_id = (SELECT id FROM employees WHERE auth_user_id = auth.uid()))
    OR (SELECT role FROM employees WHERE auth_user_id = auth.uid()) = 'ADMIN'
  );
CREATE POLICY "admin_all_supply_steps" ON supply_approval_steps
  FOR ALL USING ((SELECT role FROM employees WHERE auth_user_id = auth.uid()) = 'ADMIN');

-- RPC to submit supply request
CREATE OR REPLACE FUNCTION submit_supply_request(
  p_items JSONB  -- [{category, description, estimated_amount, note}]
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_employee_id UUID;
  v_request_id UUID;
  v_supply_manager_id UUID;
  v_admin_id UUID;
  v_item JSONB;
  v_sort INTEGER := 0;
BEGIN
  SELECT id INTO v_employee_id FROM employees WHERE auth_user_id = auth.uid() AND is_active = true;
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

  SELECT supply_manager_id INTO v_supply_manager_id FROM company_settings LIMIT 1;
  SELECT id INTO v_admin_id FROM employees WHERE role = 'ADMIN' AND is_active = true ORDER BY created_at LIMIT 1;

  IF v_supply_manager_id IS NOT NULL AND v_supply_manager_id != v_employee_id THEN
    INSERT INTO supply_approval_steps (supply_request_id, approver_id, step_order, status)
    VALUES (v_request_id, v_supply_manager_id, 1, 'PENDING');
    IF v_admin_id IS NOT NULL AND v_admin_id != v_supply_manager_id THEN
      INSERT INTO supply_approval_steps (supply_request_id, approver_id, step_order, status)
      VALUES (v_request_id, v_admin_id, 2, 'WAITING');
    END IF;
  ELSIF v_admin_id IS NOT NULL THEN
    INSERT INTO supply_approval_steps (supply_request_id, approver_id, step_order, status)
    VALUES (v_request_id, v_admin_id, 1, 'PENDING');
  END IF;

  RETURN v_request_id;
END;
$$;

-- RPC to approve supply step
CREATE OR REPLACE FUNCTION approve_supply_step(
  p_request_id UUID,
  p_approved BOOLEAN,
  p_comment TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_employee_id UUID;
  v_step supply_approval_steps%ROWTYPE;
  v_next_step supply_approval_steps%ROWTYPE;
BEGIN
  SELECT id INTO v_employee_id FROM employees WHERE auth_user_id = auth.uid() AND is_active = true;

  SELECT * INTO v_step FROM supply_approval_steps
  WHERE supply_request_id = p_request_id AND approver_id = v_employee_id AND status = 'PENDING'
  ORDER BY step_order LIMIT 1;

  IF v_step.id IS NULL THEN RAISE EXCEPTION 'No pending step found'; END IF;

  UPDATE supply_approval_steps
  SET status = CASE WHEN p_approved THEN 'APPROVED' ELSE 'REJECTED' END,
      comment = p_comment, acted_at = now()
  WHERE id = v_step.id;

  IF p_approved THEN
    SELECT * INTO v_next_step FROM supply_approval_steps
    WHERE supply_request_id = p_request_id AND step_order = v_step.step_order + 1 AND status = 'WAITING';
    IF v_next_step.id IS NOT NULL THEN
      UPDATE supply_approval_steps SET status = 'PENDING' WHERE id = v_next_step.id;
    ELSE
      UPDATE supply_requests SET status = 'APPROVED' WHERE id = p_request_id;
    END IF;
  ELSE
    UPDATE supply_requests SET status = 'REJECTED' WHERE id = p_request_id;
    UPDATE supply_approval_steps SET status = 'REJECTED' WHERE supply_request_id = p_request_id AND status = 'WAITING';
  END IF;
END;
$$;
