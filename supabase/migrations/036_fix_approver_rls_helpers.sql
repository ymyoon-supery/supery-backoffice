-- ============================================================
-- 036_fix_approver_rls_helpers.sql
-- Fix is_leave_approver / is_expense_approver to allow reading
-- leave/expense data for APPROVED steps (not only PENDING).
-- Previous version blocked RLS join when step was already APPROVED,
-- causing a null join and client-side crash on 팀장 pending page.
-- ============================================================

CREATE OR REPLACE FUNCTION is_leave_approver(request_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM leave_approval_steps las
    WHERE las.leave_request_id = request_id
      AND las.approver_id = get_my_employee_id()
  );
$$;

CREATE OR REPLACE FUNCTION is_expense_approver(report_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM expense_approval_steps eas
    WHERE eas.expense_report_id = report_id
      AND eas.approver_id = get_my_employee_id()
  );
$$;
