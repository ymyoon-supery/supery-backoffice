-- 082_subscriptions.sql
-- 회사 SaaS 구독서비스 관리 테이블

CREATE TABLE subscriptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  cost            INTEGER NOT NULL CHECK (cost > 0),
  billing_cycle   TEXT NOT NULL CHECK (billing_cycle IN ('MONTHLY', 'YEARLY')),
  renewal_date    DATE NOT NULL,
  manager_id      UUID REFERENCES employees(id) ON DELETE SET NULL,
  payment_method  TEXT NOT NULL CHECK (payment_method IN ('CARD', 'TRANSFER', 'OTHER')),
  card_name       TEXT,
  card_last4      TEXT,
  license_count   INTEGER,
  department_id   UUID REFERENCES departments(id) ON DELETE SET NULL,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subscriptions_admin_all" ON subscriptions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM employees
      WHERE auth_user_id = auth.uid() AND role = 'ADMIN'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM employees
      WHERE auth_user_id = auth.uid() AND role = 'ADMIN'
    )
  );

CREATE TRIGGER trg_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
