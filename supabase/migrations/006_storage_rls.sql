-- ============================================================
-- 006_storage_rls.sql
-- Storage bucket creation and RLS policies
-- Run after connecting to Supabase with service_role
-- ============================================================

-- Create the expense receipts bucket (private)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'receipts',
  'receipts',
  false,
  10485760, -- 10MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Create the reports bucket for generated PDFs/Excel (private)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'reports',
  'reports',
  false,
  52428800, -- 50MB
  ARRAY['application/pdf', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
)
ON CONFLICT (id) DO NOTHING;

-- ── receipts bucket policies ───────────────────────────────

-- Employees can upload to their own folder: receipts/{employee_id}/...
CREATE POLICY "receipts_upload_own"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'receipts'
    AND (storage.foldername(name))[1] = get_my_employee_id()::text
  );

-- Employees can read their own receipts; admins/managers can read all
CREATE POLICY "receipts_read_own_or_admin"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'receipts'
    AND (
      (storage.foldername(name))[1] = get_my_employee_id()::text
      OR is_admin()
      OR is_manager_of((storage.foldername(name))[1]::uuid)
    )
  );

-- Employees can delete their own pending receipts; admins can delete any
CREATE POLICY "receipts_delete_own"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'receipts'
    AND (
      (storage.foldername(name))[1] = get_my_employee_id()::text
      OR is_admin()
    )
  );

-- ── reports bucket policies ────────────────────────────────

-- Only admins can upload generated reports
CREATE POLICY "reports_upload_admin"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'reports'
    AND is_admin()
  );

-- Only admins can read reports
CREATE POLICY "reports_read_admin"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'reports'
    AND is_admin()
  );

-- Only admins can delete reports
CREATE POLICY "reports_delete_admin"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'reports'
    AND is_admin()
  );
