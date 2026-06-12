-- Extend expense_reports with new payment and detail fields
ALTER TABLE expense_reports
  ADD COLUMN IF NOT EXISTS payee                TEXT,
  ADD COLUMN IF NOT EXISTS payment_method       TEXT CHECK (payment_method IN ('CASH', 'CARD', 'TRANSFER')),
  ADD COLUMN IF NOT EXISTS bank_name            TEXT,
  ADD COLUMN IF NOT EXISTS account_number       TEXT,
  ADD COLUMN IF NOT EXISTS account_holder       TEXT,
  ADD COLUMN IF NOT EXISTS payment_request_date DATE,
  ADD COLUMN IF NOT EXISTS settlement_date      DATE,
  ADD COLUMN IF NOT EXISTS line_items           JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS attachment_urls      JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Recreate RPC with new params (backward-compatible defaults)
CREATE OR REPLACE FUNCTION submit_expense_report(
  p_title                 TEXT,
  p_amount                INTEGER,
  p_category              TEXT,
  p_expense_date          DATE,
  p_receipt_url           TEXT DEFAULT NULL,
  p_description           TEXT DEFAULT NULL,
  p_payee                 TEXT DEFAULT NULL,
  p_payment_method        TEXT DEFAULT NULL,
  p_bank_name             TEXT DEFAULT NULL,
  p_account_number        TEXT DEFAULT NULL,
  p_account_holder        TEXT DEFAULT NULL,
  p_payment_request_date  DATE DEFAULT NULL,
  p_settlement_date       DATE DEFAULT NULL,
  p_line_items            JSONB DEFAULT '[]'::jsonb,
  p_attachment_urls       JSONB DEFAULT '[]'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_employee_id   UUID;
  v_report_id     UUID;
  v_manager_id    UUID;
  v_admin_id      UUID;
BEGIN
  SELECT id INTO v_employee_id
  FROM employees
  WHERE auth_user_id = auth.uid() AND is_active = true;

  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'Employee not found';
  END IF;

  INSERT INTO expense_reports (
    employee_id, title, amount, category, expense_date, receipt_url, description,
    payee, payment_method, bank_name, account_number, account_holder,
    payment_request_date, settlement_date, line_items, attachment_urls
  ) VALUES (
    v_employee_id, p_title, p_amount, p_category, p_expense_date, p_receipt_url, p_description,
    p_payee, p_payment_method, p_bank_name, p_account_number, p_account_holder,
    p_payment_request_date, p_settlement_date, p_line_items, p_attachment_urls
  )
  RETURNING id INTO v_report_id;

  SELECT d.manager_id INTO v_manager_id
  FROM employees e
  JOIN departments d ON d.id = e.department_id
  WHERE e.id = v_employee_id
    AND d.manager_id IS NOT NULL
    AND d.manager_id != v_employee_id;

  SELECT id INTO v_admin_id
  FROM employees
  WHERE role = 'ADMIN' AND is_active = true
  ORDER BY created_at
  LIMIT 1;

  IF v_manager_id IS NOT NULL THEN
    INSERT INTO expense_approval_steps (expense_report_id, approver_id, step_order)
    VALUES (v_report_id, v_manager_id, 1);

    IF v_admin_id IS NOT NULL AND v_admin_id != v_manager_id THEN
      INSERT INTO expense_approval_steps (expense_report_id, approver_id, step_order)
      VALUES (v_report_id, v_admin_id, 2);
    END IF;
  ELSIF v_admin_id IS NOT NULL THEN
    INSERT INTO expense_approval_steps (expense_report_id, approver_id, step_order)
    VALUES (v_report_id, v_admin_id, 1);
  END IF;

  RETURN v_report_id;
END;
$$;
