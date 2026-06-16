-- Allow COMPLETED status for supply_requests (구매확인 처리)
ALTER TABLE supply_requests
  DROP CONSTRAINT supply_requests_status_check,
  ADD CONSTRAINT supply_requests_status_check
    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'COMPLETED'));
