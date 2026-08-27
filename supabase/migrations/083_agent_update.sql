-- agent 자동 업데이트: company_settings에 버전 정보 추가 + storage 버킷 생성

ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS agent_version              TEXT,
  ADD COLUMN IF NOT EXISTS agent_exe_storage_path     TEXT,
  ADD COLUMN IF NOT EXISTS agent_version_updated_at   TIMESTAMPTZ;

-- agent EXE 파일 보관용 private 버킷
-- service_role로 업로드/서명 URL 생성, 에이전트는 서명 URL로 다운로드
INSERT INTO storage.buckets (id, name, public)
VALUES ('agent-releases', 'agent-releases', false)
ON CONFLICT (id) DO NOTHING;
