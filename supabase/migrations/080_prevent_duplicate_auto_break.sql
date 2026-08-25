-- 자동 휴식(PC 비활동) 중복 삽입 방지
-- 동일 직원에 대해 1분 이내 자동 BREAK_START 중복 방지 (Race Condition 차단)
-- 자동 휴식 중복 삽입 방지: 동일 직원·동일 시각 BREAK_START 중복 차단
-- (date_trunc는 timestamptz에 대해 STABLE이라 함수 인덱스 불가 → recorded_at 직접 사용)
CREATE UNIQUE INDEX uniq_auto_break_exact_time
  ON attendance_records (employee_id, recorded_at)
  WHERE type = 'BREAK_START' AND note = 'PC 비활동 자동 휴식';
