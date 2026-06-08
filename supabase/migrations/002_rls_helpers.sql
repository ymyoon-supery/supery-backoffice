-- ============================================================
-- 002_rls_helpers.sql
-- SECURITY DEFINER helper functions for RLS policies
-- All functions use SET search_path to prevent search_path injection
-- ============================================================

-- Returns the employees.id for the currently authenticated user
CREATE OR REPLACE FUNCTION get_my_employee_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT id FROM employees WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

-- Returns true if the current user has role = 'ADMIN'
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM employees
    WHERE auth_user_id = auth.uid()
      AND role = 'ADMIN'
      AND is_active = true
  );
$$;

-- Returns true if the current user has role = 'MANAGER'
CREATE OR REPLACE FUNCTION is_manager()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM employees
    WHERE auth_user_id = auth.uid()
      AND role IN ('ADMIN', 'MANAGER')
      AND is_active = true
  );
$$;

-- Returns true if the current user is a manager of the given employee
-- (same department or is admin)
CREATE OR REPLACE FUNCTION is_manager_of(target_employee_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM employees me
    JOIN employees target ON target.id = target_employee_id
    JOIN departments d ON d.id = target.department_id
    WHERE me.auth_user_id = auth.uid()
      AND me.is_active = true
      AND (
        me.role = 'ADMIN'
        OR (me.role = 'MANAGER' AND d.manager_id = me.id)
      )
  );
$$;

-- Returns true if the current user is a pending approver for the leave request
CREATE OR REPLACE FUNCTION is_leave_approver(request_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM leave_approval_steps las
    WHERE las.leave_request_id = request_id
      AND las.approver_id = get_my_employee_id()
      AND las.status = 'PENDING'
  );
$$;

-- Returns true if the current user is a pending approver for the expense report
CREATE OR REPLACE FUNCTION is_expense_approver(report_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM expense_approval_steps eas
    WHERE eas.expense_report_id = report_id
      AND eas.approver_id = get_my_employee_id()
      AND eas.status = 'PENDING'
  );
$$;
