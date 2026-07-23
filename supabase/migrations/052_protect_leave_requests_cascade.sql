-- Protect leave_requests from accidental cascade deletion when employees are deleted.
-- Previously ON DELETE CASCADE caused leave history to be wiped if an employee row
-- was removed (e.g. via Supabase dashboard). Changed to RESTRICT so that an employee
-- with leave records cannot be hard-deleted, preserving historical data.
ALTER TABLE leave_requests
  DROP CONSTRAINT leave_requests_employee_id_fkey;

ALTER TABLE leave_requests
  ADD CONSTRAINT leave_requests_employee_id_fkey
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE RESTRICT;

-- Same protection for expense_reports and attendance_records
ALTER TABLE expense_reports
  DROP CONSTRAINT expense_reports_employee_id_fkey;

ALTER TABLE expense_reports
  ADD CONSTRAINT expense_reports_employee_id_fkey
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE RESTRICT;

ALTER TABLE attendance_records
  DROP CONSTRAINT attendance_records_employee_id_fkey;

ALTER TABLE attendance_records
  ADD CONSTRAINT attendance_records_employee_id_fkey
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE RESTRICT;
