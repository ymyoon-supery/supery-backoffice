-- 058_fix_expense_type_and_steps_status.sql
--
-- Two fixes:
-- 1. expense_type was referenced in INSERT/SELECT but never ADD COLUMNed.
--    IF NOT EXISTS means this is safe to run even if already added via dashboard.
-- 2. expense_approval_steps CHECK constraint didn't include 'CANCELLED',
--    causing cancelExpenseRequest step-cleanup to silently fail.

ALTER TABLE expense_reports
  ADD COLUMN IF NOT EXISTS expense_type TEXT;

ALTER TABLE expense_approval_steps
  DROP CONSTRAINT IF EXISTS expense_approval_steps_status_check;

ALTER TABLE expense_approval_steps
  ADD CONSTRAINT expense_approval_steps_status_check
  CHECK (status IN ('WAITING', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'));
