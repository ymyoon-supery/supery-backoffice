-- 주민번호 암호화 저장 테이블
-- AES-256-GCM으로 암호화된 SSN을 expense_reports와 분리 보관
CREATE TABLE expense_sensitive_data (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_report_id uuid NOT NULL REFERENCES expense_reports(id) ON DELETE CASCADE,
  encrypted_ssn     text NOT NULL,
  iv                text NOT NULL,
  created_at        timestamptz DEFAULT now()
);

-- 사용자 직접 접근 차단 (서비스 롤만 접근)
ALTER TABLE expense_sensitive_data ENABLE ROW LEVEL SECURITY;

-- Data API grants (auto-added by .claude/hooks/auto-migration-grants.js)
-- No client access: service_role only (no RLS policies for authenticated/anon)

GRANT ALL ON TABLE expense_sensitive_data TO service_role;
