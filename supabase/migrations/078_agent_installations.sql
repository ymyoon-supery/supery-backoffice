-- 직원 테이블에 에이전트 API 키 컬럼 추가
ALTER TABLE employees
ADD COLUMN IF NOT EXISTS agent_api_key text UNIQUE;

-- 에이전트 설치 현황 테이블
CREATE TABLE IF NOT EXISTS agent_installations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  device_name text NOT NULL DEFAULT 'Unknown',
  os_info text,
  app_version text,
  registered_at timestamptz DEFAULT now(),
  last_seen_at timestamptz DEFAULT now(),
  UNIQUE(employee_id, device_name)
);

CREATE INDEX IF NOT EXISTS agent_installations_employee_idx
  ON agent_installations(employee_id);

CREATE INDEX IF NOT EXISTS agent_installations_last_seen_idx
  ON agent_installations(last_seen_at DESC);
