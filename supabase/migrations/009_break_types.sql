-- ============================================================
-- 009_break_types.sql
-- Adds BREAK_START, BREAK_END, FIELD_START, FIELD_END types
-- Relaxes unique constraint to allow multiple breaks per day
-- ============================================================

-- 1. Drop old unique index (blocked multiple records of same type per day)
DROP INDEX IF EXISTS uniq_attendance_daily;

-- 2. Enforce uniqueness only on CHECK_IN and CHECK_OUT (one arrival/departure per day)
CREATE UNIQUE INDEX uniq_attendance_daily_main
  ON attendance_records (
    employee_id,
    ((recorded_at AT TIME ZONE 'Asia/Seoul')::date),
    type
  )
  WHERE type IN ('CHECK_IN', 'CHECK_OUT');

-- 3. Expand type constraint
ALTER TABLE attendance_records
  DROP CONSTRAINT attendance_records_type_check;

ALTER TABLE attendance_records
  ADD CONSTRAINT attendance_records_type_check
  CHECK (type IN ('CHECK_IN', 'CHECK_OUT', 'BREAK_START', 'BREAK_END', 'FIELD_START', 'FIELD_END'));
