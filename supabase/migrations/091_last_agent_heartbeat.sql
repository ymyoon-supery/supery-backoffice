-- 091_last_agent_heartbeat.sql
-- employees에 last_agent_heartbeat 컬럼 추가
-- 목적: PC 에이전트 heartbeat 시각을 브라우저 heartbeat(last_heartbeat)와 분리
-- 브라우저 heartbeat의 agentIsActive 판단이 자기 자신의 last_heartbeat를 보고
-- 에이전트가 활성이라고 착각하는 버그 수정

ALTER TABLE employees ADD COLUMN IF NOT EXISTS last_agent_heartbeat timestamptz;
