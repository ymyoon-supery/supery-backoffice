-- Allow all active employees to read company_settings (needed for supply manager checks, work schedule display, etc.)
CREATE POLICY "employee_read" ON company_settings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM employees
      WHERE auth_user_id = auth.uid() AND is_active = true
    )
  );
