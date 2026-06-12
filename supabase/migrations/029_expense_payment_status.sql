-- Add payment_status to expense_reports for post-approval payment tracking
ALTER TABLE expense_reports
  ADD COLUMN IF NOT EXISTS payment_status TEXT
    CHECK (payment_status IN ('PENDING_PAYMENT', 'PAID', 'SETTLED'))
    DEFAULT 'PENDING_PAYMENT';

-- Existing approved reports start as PENDING_PAYMENT
UPDATE expense_reports
SET payment_status = 'PENDING_PAYMENT'
WHERE payment_status IS NULL;
