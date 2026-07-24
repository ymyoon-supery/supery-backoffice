-- Remove plaintext card_number column from expense_reports.
-- Card numbers are now encrypted in expense_card_sensitive_data (added in migration 055).
ALTER TABLE expense_reports DROP COLUMN IF EXISTS card_number;

-- Recreate RPC without p_card_number parameter
CREATE OR REPLACE FUNCTION submit_expense_report(
  p_title                TEXT,
  p_amount               INTEGER,
  p_category             TEXT,
  p_expense_date         DATE,
  p_receipt_url          TEXT    DEFAULT NULL,
  p_description          TEXT    DEFAULT NULL,
  p_payee                TEXT    DEFAULT NULL,
  p_payment_method       TEXT    DEFAULT NULL,
  p_bank_name            TEXT    DEFAULT NULL,
  p_account_number       TEXT    DEFAULT NULL,
  p_account_holder       TEXT    DEFAULT NULL,
  p_payment_request_date DATE    DEFAULT NULL,
  p_settlement_date      DATE    DEFAULT NULL,
  p_line_items           JSONB   DEFAULT '[]'::jsonb,
  p_attachment_urls      JSONB   DEFAULT '[]'::jsonb,
  p_tax_type             TEXT    DEFAULT NULL,
  p_evidence_type        TEXT    DEFAULT NULL,
  p_expense_type         TEXT    DEFAULT NULL,
  p_card_company         TEXT    DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_employee_id UUID;
  v_dept_id     UUID;
  v_report_id   UUID;
  v_manager_id  UUID;
  v_admin_id    UUID;
BEGIN
  SELECT id, department_id INTO v_employee_id, v_dept_id
  FROM employees
  WHERE auth_user_id = auth.uid() AND is_active = true;

  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'Employee not found';
  END IF;

  INSERT INTO expense_reports (
    employee_id, title, amount, category, expense_date, receipt_url, description,
    payee, payment_method, bank_name, account_number, account_holder,
    payment_request_date, settlement_date, line_items, attachment_urls,
    tax_type, evidence_type, expense_type, card_company
  ) VALUES (
    v_employee_id, p_title, p_amount, p_category, p_expense_date, p_receipt_url, p_description,
    p_payee, p_payment_method, p_bank_name, p_account_number, p_account_holder,
    p_payment_request_date, p_settlement_date, p_line_items, p_attachment_urls,
    p_tax_type, p_evidence_type, p_expense_type, p_card_company
  ) RETURNING id INTO v_report_id;

  SELECT id INTO v_manager_id
  FROM employees
  WHERE department_id = v_dept_id
    AND position = '팀장'
    AND is_active = true
    AND id != v_employee_id
  LIMIT 1;

  SELECT id INTO v_admin_id
  FROM employees
  WHERE role = 'ADMIN' AND is_active = true
  ORDER BY created_at
  LIMIT 1;

  IF v_manager_id IS NOT NULL THEN
    INSERT INTO expense_approval_steps (expense_report_id, approver_id, step_order, status)
    VALUES (v_report_id, v_manager_id, 1, 'PENDING');
    IF v_admin_id IS NOT NULL AND v_admin_id != v_manager_id THEN
      INSERT INTO expense_approval_steps (expense_report_id, approver_id, step_order, status)
      VALUES (v_report_id, v_admin_id, 2, 'WAITING');
    END IF;
  ELSIF v_admin_id IS NOT NULL THEN
    INSERT INTO expense_approval_steps (expense_report_id, approver_id, step_order, status)
    VALUES (v_report_id, v_admin_id, 1, 'PENDING');
  END IF;

  RETURN v_report_id;
END;
$$;
