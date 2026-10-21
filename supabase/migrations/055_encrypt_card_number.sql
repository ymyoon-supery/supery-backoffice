-- Encrypted card number table for 기타소득(경품비) personal card submissions
CREATE TABLE expense_card_sensitive_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_report_id uuid NOT NULL REFERENCES expense_reports(id) ON DELETE CASCADE,
  encrypted_card_number text NOT NULL,
  iv text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (expense_report_id)
);
ALTER TABLE expense_card_sensitive_data ENABLE ROW LEVEL SECURITY;

-- Data API grants (auto-added by .claude/hooks/auto-migration-grants.js)
-- No client access: service_role only (no RLS policies for authenticated/anon)

GRANT ALL ON TABLE expense_card_sensitive_data TO service_role;
