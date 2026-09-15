-- 085_attendance_checkout_unique.sql
--
-- attendance_records에 하루 1 CHECK_OUT 제약 추가
-- 기존 중복 데이터를 먼저 정리한 뒤 부분 UNIQUE 인덱스 생성

-- 중복 CHECK_OUT이 있으면 최신 1건만 남기고 삭제
-- (recorded_at이 가장 늦은 것을 정상 퇴근으로 간주)
DELETE FROM attendance_records
WHERE id IN (
  SELECT id FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY employee_id, CAST(recorded_at AT TIME ZONE 'Asia/Seoul' AS date)
        ORDER BY recorded_at DESC, id DESC
      ) AS rn
    FROM attendance_records
    WHERE type = 'CHECK_OUT'
  ) ranked
  WHERE rn > 1
);

-- 직원 × KST 날짜 기준으로 CHECK_OUT 하루 1건만 허용
CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_one_checkout_per_day
  ON attendance_records (employee_id, CAST(recorded_at AT TIME ZONE 'Asia/Seoul' AS date))
  WHERE type = 'CHECK_OUT';
