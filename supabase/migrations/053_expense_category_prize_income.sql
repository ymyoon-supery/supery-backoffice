-- Add PRIZE_INCOME to expense_reports category check constraint.
-- Previously only BUSINESS_INCOME was added (migration 050); PRIZE_INCOME
-- was missing, causing a constraint violation when submitting 기타소득 경품비.
ALTER TABLE expense_reports
  DROP CONSTRAINT expense_reports_category_check;

ALTER TABLE expense_reports
  ADD CONSTRAINT expense_reports_category_check
  CHECK (category IN (
    'TRANSPORT','MEAL','ACCOMMODATION','SUPPLIES','OTHER',
    'BUSINESS_INCOME','PRIZE_INCOME'
  ));
