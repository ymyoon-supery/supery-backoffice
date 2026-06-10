-- ============================================================
-- 012_groups_rls.sql
-- Enable RLS on groups table and add policies
-- (010 created the table without RLS setup)
-- ============================================================

-- Ensure grants are set (new tables may not inherit defaults)
GRANT ALL ON TABLE groups TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE groups TO authenticated;
GRANT SELECT ON TABLE groups TO anon;

-- Enable RLS
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read groups
CREATE POLICY "groups_select_authenticated"
  ON groups FOR SELECT
  TO authenticated
  USING (true);

-- Only admins can write (insert/update/delete)
CREATE POLICY "groups_write_admin"
  ON groups FOR ALL
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
