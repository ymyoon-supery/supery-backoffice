-- Company-wide settings (singleton row)
CREATE TABLE company_settings (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inactivity_minutes  INTEGER NOT NULL DEFAULT 15,
  office_ips          TEXT[]  NOT NULL DEFAULT '{}',
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO company_settings (inactivity_minutes, office_ips)
VALUES (15, '{}');

-- Only admins can read/write via service role; no RLS needed for service key access
ALTER TABLE company_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all" ON company_settings
  USING (
    EXISTS (
      SELECT 1 FROM employees
      WHERE auth_user_id = auth.uid() AND role = 'ADMIN'
    )
  );

-- Data API grants (auto-added by .claude/hooks/auto-migration-grants.js)

GRANT ALL ON TABLE company_settings TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE company_settings TO authenticated;
GRANT SELECT ON TABLE company_settings TO anon;
