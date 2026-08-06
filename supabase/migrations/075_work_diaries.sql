-- 075_work_diaries.sql
-- Per-employee daily markdown diary

CREATE TABLE work_diaries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  diary_date  DATE NOT NULL,
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (employee_id, diary_date)
);

ALTER TABLE work_diaries ENABLE ROW LEVEL SECURITY;

-- 본인 행 전체 권한
CREATE POLICY "work_diaries_own" ON work_diaries
  FOR ALL TO authenticated
  USING (
    employee_id = (SELECT id FROM employees WHERE auth_user_id = auth.uid() AND is_active = true LIMIT 1)
  )
  WITH CHECK (
    employee_id = (SELECT id FROM employees WHERE auth_user_id = auth.uid() AND is_active = true LIMIT 1)
  );

-- ADMIN: 전체 조회
CREATE POLICY "work_diaries_admin_read" ON work_diaries
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM employees WHERE auth_user_id = auth.uid() AND role = 'ADMIN' AND is_active = true)
  );

-- 팀장: 같은 부서 팀원 조회 (자신 제외)
CREATE POLICY "work_diaries_teamlead_read" ON work_diaries
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM employees me
      JOIN employees target ON target.id = work_diaries.employee_id
      WHERE me.auth_user_id = auth.uid()
        AND me.position = '팀장'
        AND me.is_active = true
        AND target.department_id = me.department_id
        AND target.id != me.id
        AND target.is_active = true
    )
  );

CREATE TRIGGER trg_work_diaries_updated_at
  BEFORE UPDATE ON work_diaries
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
