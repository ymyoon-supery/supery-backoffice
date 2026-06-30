-- Allow employees to cancel their own PENDING document/supply requests

-- document_requests: add CANCELLED to status constraint
ALTER TABLE document_requests
  DROP CONSTRAINT document_requests_status_check,
  ADD CONSTRAINT document_requests_status_check
    CHECK (status IN ('PENDING', 'COMPLETED', 'CANCELLED'));

-- supply_requests: add CANCELLED to status constraint
ALTER TABLE supply_requests
  DROP CONSTRAINT supply_requests_status_check,
  ADD CONSTRAINT supply_requests_status_check
    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'COMPLETED', 'CANCELLED'));

-- RLS: allow employee to cancel their own PENDING document request
CREATE POLICY "employee_cancel_document" ON document_requests
  FOR UPDATE TO authenticated
  USING (
    employee_id = (SELECT id FROM employees WHERE auth_user_id = auth.uid())
    AND status = 'PENDING'
  )
  WITH CHECK (
    employee_id = (SELECT id FROM employees WHERE auth_user_id = auth.uid())
    AND status IN ('PENDING', 'CANCELLED')
  );

-- RLS: allow employee to cancel their own PENDING supply request
CREATE POLICY "employee_cancel_supply" ON supply_requests
  FOR UPDATE TO authenticated
  USING (
    employee_id = (SELECT id FROM employees WHERE auth_user_id = auth.uid())
    AND status = 'PENDING'
  )
  WITH CHECK (
    employee_id = (SELECT id FROM employees WHERE auth_user_id = auth.uid())
    AND status IN ('PENDING', 'CANCELLED')
  );
