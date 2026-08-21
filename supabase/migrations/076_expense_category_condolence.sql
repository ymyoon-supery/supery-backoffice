-- Add CONDOLENCE to expense_reports category check constraint.
ALTER TABLE expense_reports
  DROP CONSTRAINT expense_reports_category_check;

ALTER TABLE expense_reports
  ADD CONSTRAINT expense_reports_category_check
  CHECK (category IN (
    'TRANSPORT','MEAL','ACCOMMODATION','SUPPLIES','OTHER',
    'BUSINESS_INCOME','PRIZE_INCOME','CONDOLENCE'
  ));
