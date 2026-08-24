-- 에이전트 자동 휴식 감지 on/off 컬럼
-- 외근직·현장직 등 PC 자리비움이 정상인 직원은 false로 설정
ALTER TABLE employees ADD COLUMN IF NOT EXISTS agent_auto_break boolean NOT NULL DEFAULT true;
