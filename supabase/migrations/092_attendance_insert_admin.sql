-- 092_attendance_insert_admin.sql
-- attendance_insert_own 정책이 본인 레코드만 허용해 어드민이 타인 기록을 수동 삽입할 수 없는 문제 수정.
-- UPDATE/DELETE는 이미 admin 정책이 있으나 INSERT만 누락되어 있었음.

CREATE POLICY "attendance_insert_admin"
  ON attendance_records FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());
