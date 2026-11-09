-- INSERT 정책이 weekly_meetings를 자기 참조하여 발생하는 무한 재귀 수정
-- SECURITY DEFINER 함수로 RLS 우회하여 is_confirmed 체크

CREATE OR REPLACE FUNCTION is_week_confirmed(p_week_start DATE)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM weekly_meetings
    WHERE week_start = p_week_start
      AND is_confirmed = true
  );
$$;

GRANT EXECUTE ON FUNCTION is_week_confirmed(DATE) TO authenticated;

-- 기존 INSERT 정책 교체
DROP POLICY IF EXISTS "weekly_meetings_insert" ON weekly_meetings;

CREATE POLICY "weekly_meetings_insert"
  ON weekly_meetings FOR INSERT
  TO authenticated
  WITH CHECK (
    is_admin() OR (
      department_id = (
        SELECT department_id FROM employees
        WHERE auth_user_id = auth.uid()
          AND position = '팀장'
          AND is_active = true
        LIMIT 1
      )
      AND NOT is_week_confirmed(week_start)
    )
  );
