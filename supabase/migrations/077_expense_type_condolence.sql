-- Add CONDOLENCE to expense_reports expense_type check constraint.
ALTER TABLE expense_reports
  DROP CONSTRAINT IF EXISTS expense_reports_expense_type_check;

ALTER TABLE expense_reports
  ADD CONSTRAINT expense_reports_expense_type_check
  CHECK (expense_type IN (
    'EXPENSE','CORPORATE_CARD','TRANSPORTATION','PERSONAL_CARD',
    'OTHER_RECEIPT','BUSINESS_INCOME','PRIZE','CONDOLENCE'
  ));
