-- ============================================================
-- 005_realtime.sql
-- Supabase Realtime publication for live status board
-- ============================================================

-- Add tables to the supabase_realtime publication
-- (publication is created by Supabase automatically)
ALTER PUBLICATION supabase_realtime ADD TABLE attendance_records;
ALTER PUBLICATION supabase_realtime ADD TABLE leave_approval_steps;
ALTER PUBLICATION supabase_realtime ADD TABLE expense_approval_steps;
ALTER PUBLICATION supabase_realtime ADD TABLE leave_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE expense_reports;
