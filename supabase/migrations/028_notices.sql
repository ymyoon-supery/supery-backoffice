-- Add write permission flag to employees
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS can_write_notice BOOLEAN NOT NULL DEFAULT false;

-- Notices table
CREATE TABLE notices (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id  UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  content    TEXT NOT NULL,
  is_pinned  BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_notices_updated_at
  BEFORE UPDATE ON notices
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE notices ENABLE ROW LEVEL SECURITY;

-- All active employees can read
CREATE POLICY "notices_select" ON notices
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM employees WHERE auth_user_id = auth.uid() AND is_active = true
    )
  );

-- Admin + designated writers can insert
CREATE POLICY "notices_insert" ON notices
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM employees
      WHERE auth_user_id = auth.uid() AND is_active = true
        AND (role = 'ADMIN' OR can_write_notice = true)
    )
  );

-- Admin or own author can update
CREATE POLICY "notices_update" ON notices
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM employees e
      WHERE e.auth_user_id = auth.uid() AND e.is_active = true
        AND (e.role = 'ADMIN' OR e.id = notices.author_id)
    )
  );

-- Admin or own author can delete
CREATE POLICY "notices_delete" ON notices
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM employees e
      WHERE e.auth_user_id = auth.uid() AND e.is_active = true
        AND (e.role = 'ADMIN' OR e.id = notices.author_id)
    )
  );
