-- 089_heartbeat_debug_log.sql
-- heartbeat 처리 결과 디버그 로그
-- 어느 블록이 왜 트리거/스킵됐는지 기록 → 운영 중 원인 분석용

CREATE TABLE heartbeat_debug_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id  uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  ts           timestamptz NOT NULL DEFAULT now(),
  payload      jsonb NOT NULL,          -- heartbeat 입력값
  last_type    text,                    -- 처리 시점 오늘 마지막 레코드 type
  logs         jsonb NOT NULL DEFAULT '[]'::jsonb  -- DecisionLog[] from decide-heartbeat.ts
);

CREATE INDEX idx_hb_debug_emp_ts ON heartbeat_debug_log (employee_id, ts DESC);

ALTER TABLE heartbeat_debug_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hb_debug_no_client" ON heartbeat_debug_log
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

GRANT ALL ON TABLE heartbeat_debug_log TO service_role;
