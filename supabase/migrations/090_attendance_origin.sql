-- 090_attendance_origin.sql
-- attendance_records에 origin 컬럼 추가
-- 어느 시스템이 레코드를 생성했는지 추적 → race guard 개선 및 운영 분석용

ALTER TABLE attendance_records
  ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'manual';

-- 기존 레코드 backfill: note 패턴으로 출처 구분
UPDATE attendance_records SET origin = 'agent_auto'
WHERE note IN (
  'PC 비활동 자동 휴식',
  'PC 활동 감지 자동 업무 복귀',
  'PC 절전/잠금 자동 퇴근',
  'PC 종료 자동 퇴근'
);

UPDATE attendance_records SET origin = 'browser_auto'
WHERE note IN (
  '자동 휴식 (비활동 감지)',
  '자동 업무 복귀',
  '자동 휴식 (15분 비활동)'
);

UPDATE attendance_records SET origin = 'cron_auto'
WHERE note = '근태 이상 - 퇴근 기록 없음 (자동 마감)';

-- origin 값 제약 (허용 외 값 차단)
ALTER TABLE attendance_records
  ADD CONSTRAINT attendance_records_origin_check
  CHECK (origin IN ('manual', 'agent_auto', 'browser_auto', 'cron_auto'));

-- 인덱스: origin 기반 race guard 쿼리 최적화
CREATE INDEX idx_ar_emp_type_origin_at
  ON attendance_records (employee_id, type, origin, recorded_at DESC);
