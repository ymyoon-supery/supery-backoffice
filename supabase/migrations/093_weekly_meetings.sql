-- 1. departments 팀 정렬 순서
ALTER TABLE departments
  ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 99;

UPDATE departments SET sort_order = CASE name
  WHEN '기획1팀' THEN 1
  WHEN '기획2팀' THEN 2
  WHEN '기획3팀' THEN 3
  WHEN '커머스팀' THEN 4
  WHEN '제작팀'  THEN 5
  ELSE 99
END;

-- 2. weekly_meetings 테이블
CREATE TABLE weekly_meetings (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start    DATE        NOT NULL,
  department_id UUID        NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  this_week     TEXT,
  next_week     TEXT,
  issues        TEXT,
  submitted_by  UUID        REFERENCES employees(id),
  is_confirmed  BOOLEAN     NOT NULL DEFAULT false,
  confirmed_by  UUID        REFERENCES employees(id),
  confirmed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (week_start, department_id)
);

ALTER TABLE weekly_meetings ENABLE ROW LEVEL SECURITY;

-- SELECT: 팀장 또는 관리자만
CREATE POLICY "weekly_meetings_select"
  ON weekly_meetings FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM employees
      WHERE auth_user_id = auth.uid()
        AND is_active = true
        AND (role = 'ADMIN' OR position = '팀장')
    )
  );

-- INSERT: 관리자 또는 본인 팀 팀장 (해당 주 미확인 시)
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
      AND NOT EXISTS (
        SELECT 1 FROM weekly_meetings wm2
        WHERE wm2.week_start = weekly_meetings.week_start
          AND wm2.is_confirmed = true
      )
    )
  );

-- UPDATE: 관리자 또는 미확인 레코드 + 본인 팀 팀장
CREATE POLICY "weekly_meetings_update"
  ON weekly_meetings FOR UPDATE
  TO authenticated
  USING (
    is_admin() OR (
      is_confirmed = false AND
      department_id = (
        SELECT department_id FROM employees
        WHERE auth_user_id = auth.uid()
          AND position = '팀장'
          AND is_active = true
        LIMIT 1
      )
    )
  )
  WITH CHECK (
    is_admin() OR
    department_id = (
      SELECT department_id FROM employees
      WHERE auth_user_id = auth.uid()
        AND position = '팀장'
        AND is_active = true
      LIMIT 1
    )
  );

-- 3. 최종확인 RPC (관리자 전용)
CREATE OR REPLACE FUNCTION confirm_weekly_meetings(p_week_start DATE)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_employee_id UUID;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Permission denied: admin only';
  END IF;
  v_employee_id := get_my_employee_id();
  UPDATE weekly_meetings
  SET
    is_confirmed = true,
    confirmed_by = v_employee_id,
    confirmed_at = now()
  WHERE week_start = p_week_start;
END;
$$;

GRANT EXECUTE ON FUNCTION confirm_weekly_meetings(DATE) TO authenticated;

-- Data API grants (auto-added by .claude/hooks/auto-migration-grants.js)

GRANT ALL ON TABLE weekly_meetings TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE weekly_meetings TO authenticated;
GRANT SELECT ON TABLE weekly_meetings TO anon;
