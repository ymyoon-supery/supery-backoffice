CREATE TABLE payslips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  year_month TEXT NOT NULL,  -- format: 'YYYY-MM'
  file_url TEXT NOT NULL,
  file_name TEXT,
  uploaded_by UUID REFERENCES employees(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(employee_id, year_month)
);

ALTER TABLE payslips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "employee_view_own" ON payslips
  FOR SELECT USING (
    employee_id = (SELECT id FROM employees WHERE auth_user_id = auth.uid() AND is_active = true)
  );

CREATE POLICY "admin_all" ON payslips
  FOR ALL USING (
    (SELECT role FROM employees WHERE auth_user_id = auth.uid()) = 'ADMIN'
  );
