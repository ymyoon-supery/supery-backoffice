-- ============================================================
-- 010_groups_team_rank.sql
-- Groups, team-group linkage, employee rank field
-- ============================================================

-- 그룹 테이블 (기획/제작/커머스 등)
CREATE TABLE IF NOT EXISTS groups (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- departments(팀)에 group_id 연결
ALTER TABLE departments ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES groups(id) ON DELETE SET NULL;

-- employees에 직급(rank) 컬럼 추가
ALTER TABLE employees ADD COLUMN IF NOT EXISTS rank TEXT;
ALTER TABLE employees ADD CONSTRAINT employees_rank_check
  CHECK (rank IS NULL OR rank IN ('사원','대리','과장','차장','부장'));

-- employees.position에 직위 제약 (기존 NULL 허용 유지)
-- 팀원/팀장 또는 NULL
ALTER TABLE employees ADD CONSTRAINT employees_position_check
  CHECK (position IS NULL OR position IN ('팀원','팀장'));
