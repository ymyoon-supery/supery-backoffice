-- 자동 휴식(PC 비활동) 중복 삽입 방지
-- 동일 직원에 대해 1분 이내 자동 BREAK_START 중복 방지 (Race Condition 차단)
-- timestamptz → timestamp 캐스팅으로 IMMUTABLE 확보 (date_trunc(timestamptz)는 STABLE이라 인덱스 불가)
CREATE UNIQUE INDEX uniq_auto_break_per_minute
  ON attendance_records (
    employee_id,
    date_trunc('minute', recorded_at::timestamp)
  )
  WHERE type = 'BREAK_START' AND note = 'PC 비활동 자동 휴식';
