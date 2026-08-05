-- 074_resubmit_expense_report_rpc.sql
--
-- Allows an employee to modify and resubmit a REJECTED expense report.
-- Updates all fields in-place, resets status to PENDING, and rebuilds approval steps.

CREATE OR REPLACE FUNCTION resubmit_expense_report(
  p_report_id            UUID,
  p_title                TEXT,
  p_amount               INTEGER,
  p_category             TEXT,
  p_expense_date         DATE,
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
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_employee_id UUID;
  v_dept_id     UUID;
  v_manager_id  UUID;
  v_admin_id    UUID;
BEGIN
  SELECT e.id, e.department_id INTO v_employee_id, v_dept_id
  FROM expense_reports er
  JOIN employees e ON e.id = er.employee_id
  WHERE er.id = p_report_id
    AND er.status = 'REJECTED'
    AND e.auth_user_id = auth.uid()
    AND e.is_active = true
  FOR UPDATE OF er;

  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION '재신청할 수 없는 지출결의서입니다.';
  END IF;

  UPDATE expense_reports SET
    title                = p_title,
    amount               = p_amount,
    category             = p_category,
    expense_date         = p_expense_date,
    payee                = p_payee,
    payment_method       = p_payment_method,
    bank_name            = p_bank_name,
    account_number       = p_account_number,
    account_holder       = p_account_holder,
    payment_request_date = p_payment_request_date,
    settlement_date      = p_settlement_date,
    line_items           = p_line_items,
    attachment_urls      = p_attachment_urls,
    tax_type             = p_tax_type,
    evidence_type        = p_evidence_type,
    expense_type         = p_expense_type,
    card_company         = p_card_company,
    status               = 'PENDING',
    updated_at           = now()
  WHERE id = p_report_id;

  DELETE FROM expense_approval_steps WHERE expense_report_id = p_report_id;

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
    VALUES (p_report_id, v_manager_id, 1, 'PENDING');
    IF v_admin_id IS NOT NULL AND v_admin_id != v_manager_id THEN
      INSERT INTO expense_approval_steps (expense_report_id, approver_id, step_order, status)
      VALUES (p_report_id, v_admin_id, 2, 'WAITING');
    END IF;
  ELSIF v_admin_id IS NOT NULL THEN
    INSERT INTO expense_approval_steps (expense_report_id, approver_id, step_order, status)
    VALUES (p_report_id, v_admin_id, 1, 'PENDING');
  END IF;
END;
$$;
