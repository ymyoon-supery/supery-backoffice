-- Add UNIQUE constraint on expense_report_id to prevent duplicate SSN records
-- (expense_card_sensitive_data already has this constraint from migration 055)
ALTER TABLE expense_sensitive_data
  ADD CONSTRAINT expense_sensitive_data_expense_report_id_key UNIQUE (expense_report_id);
