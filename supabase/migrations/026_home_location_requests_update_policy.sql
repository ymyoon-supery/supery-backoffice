-- Employee: update own PENDING requests (for auto-cancel on new submission)
CREATE POLICY "employee_update_own_pending" ON home_location_requests
  FOR UPDATE USING (
    employee_id = (SELECT id FROM employees WHERE auth_user_id = auth.uid())
  );
