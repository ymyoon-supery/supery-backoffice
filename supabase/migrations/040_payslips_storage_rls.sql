-- ============================================================
-- 040_payslips_storage_rls.sql
-- Storage RLS policies for the payslips bucket
-- ============================================================

-- Admin can upload payslips
CREATE POLICY "payslips_upload_admin"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'payslips'
    AND is_admin()
  );

-- Admin can overwrite (upsert) payslips
CREATE POLICY "payslips_update_admin"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'payslips' AND is_admin())
  WITH CHECK (bucket_id = 'payslips' AND is_admin());

-- Admin can read all; employees can read their own folder
CREATE POLICY "payslips_read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'payslips'
    AND (
      is_admin()
      OR (storage.foldername(name))[1] = get_my_employee_id()::text
    )
  );

-- Admin can delete payslips
CREATE POLICY "payslips_delete_admin"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'payslips'
    AND is_admin()
  );
