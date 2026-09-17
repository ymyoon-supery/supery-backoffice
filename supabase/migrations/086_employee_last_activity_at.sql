-- employees 테이블에 last_activity_at 컬럼 추가
-- 마지막으로 사람이 실제 키보드/마우스를 사용한 시각 (절전 wake 이벤트 제외)
-- auto-checkout cron에서 effectiveBreakStart가 없을 때 fallback으로 사용

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS last_activity_at timestamptz;
