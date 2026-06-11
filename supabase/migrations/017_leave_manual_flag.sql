-- 수동 등록 여부 구분 컬럼 추가
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS is_manual BOOLEAN NOT NULL DEFAULT FALSE;
