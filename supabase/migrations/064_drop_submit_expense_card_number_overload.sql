-- Drop the old submit_expense_report overload that included p_card_number (migration 051).
-- Migration 057 added a new signature without p_card_number, leaving two overloads
-- that cause "Could not choose the best candidate function" errors at call time.
DROP FUNCTION IF EXISTS public.submit_expense_report(
  text, integer, text, date,
  text, text, text, text, text, text, text,
  date, date, jsonb, jsonb,
  text, text, text, text, text
);
