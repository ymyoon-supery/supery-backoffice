-- Break circular RLS chain that causes infinite recursion when PostgREST
-- embeds supply_approval_steps within supply_requests queries:
--   view_supply_steps → approver_view_supply → view_supply_steps → ...
--
-- Using SECURITY DEFINER bypasses supply_requests RLS inside the function,
-- preventing the circular reference.

CREATE OR REPLACE FUNCTION is_supply_request_owner(p_request_id UUID, p_employee_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM supply_requests
    WHERE id = p_request_id AND employee_id = p_employee_id
  )
$$;

DROP POLICY IF EXISTS "view_supply_steps" ON supply_approval_steps;
CREATE POLICY "view_supply_steps" ON supply_approval_steps
  FOR SELECT USING (
    approver_id = (SELECT id FROM employees WHERE auth_user_id = auth.uid())
    OR is_supply_request_owner(supply_request_id, (SELECT id FROM employees WHERE auth_user_id = auth.uid()))
    OR (SELECT role FROM employees WHERE auth_user_id = auth.uid()) = 'ADMIN'
  );
