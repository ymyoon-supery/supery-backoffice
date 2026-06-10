-- ============================================================
-- 013_leave_promotion.sql
-- 연차사용촉진 공지 테이블
-- ============================================================

CREATE TABLE leave_promotion_notices (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id   UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  fiscal_year   INTEGER NOT NULL,
  notice_type   TEXT NOT NULL CHECK (notice_type IN ('FIRST', 'SECOND')),
  remaining_days NUMERIC(4,1) NOT NULL,
  content       TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'SENT')),
  sent_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, fiscal_year, notice_type)
);

GRANT ALL ON TABLE leave_promotion_notices TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE leave_promotion_notices TO authenticated;
GRANT SELECT ON TABLE leave_promotion_notices TO anon;

ALTER TABLE leave_promotion_notices ENABLE ROW LEVEL SECURITY;

-- 관리자만 접근 가능
CREATE POLICY "leave_promo_admin"
  ON leave_promotion_notices FOR ALL
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

NOTIFY pgrst, 'reload schema';
