-- 095_backfill_data_api_grants.sql
-- Production safety net: re-applies Data API grants for all tables that were
-- created before auto-grant hooks were in place.
-- Idempotent: safe to run multiple times (GRANT is a no-op if already granted).

-- ============================================================
-- 001_initial_schema tables
-- ============================================================

GRANT ALL ON TABLE departments TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE departments TO authenticated;
GRANT SELECT ON TABLE departments TO anon;

GRANT ALL ON TABLE employees TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE employees TO authenticated;
GRANT SELECT ON TABLE employees TO anon;

GRANT ALL ON TABLE attendance_records TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE attendance_records TO authenticated;
GRANT SELECT ON TABLE attendance_records TO anon;

GRANT ALL ON TABLE leave_requests TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE leave_requests TO authenticated;
GRANT SELECT ON TABLE leave_requests TO anon;

GRANT ALL ON TABLE leave_approval_steps TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE leave_approval_steps TO authenticated;
GRANT SELECT ON TABLE leave_approval_steps TO anon;

GRANT ALL ON TABLE expense_reports TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE expense_reports TO authenticated;
GRANT SELECT ON TABLE expense_reports TO anon;

GRANT ALL ON TABLE expense_approval_steps TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE expense_approval_steps TO authenticated;
GRANT SELECT ON TABLE expense_approval_steps TO anon;

GRANT ALL ON TABLE outbox_events TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE outbox_events TO authenticated;
GRANT SELECT ON TABLE outbox_events TO anon;

-- ============================================================
-- 010_groups_team_rank tables
-- ============================================================

GRANT ALL ON TABLE groups TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE groups TO authenticated;
GRANT SELECT ON TABLE groups TO anon;

-- ============================================================
-- 021_company_settings tables
-- ============================================================

GRANT ALL ON TABLE company_settings TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE company_settings TO authenticated;
GRANT SELECT ON TABLE company_settings TO anon;

-- ============================================================
-- 025_home_location_requests tables
-- ============================================================

GRANT ALL ON TABLE home_location_requests TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE home_location_requests TO authenticated;
GRANT SELECT ON TABLE home_location_requests TO anon;

-- ============================================================
-- 028_notices tables
-- ============================================================

GRANT ALL ON TABLE notices TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE notices TO authenticated;
GRANT SELECT ON TABLE notices TO anon;

-- ============================================================
-- 030_projects_table tables
-- ============================================================

GRANT ALL ON TABLE projects TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE projects TO authenticated;
GRANT SELECT ON TABLE projects TO anon;

-- ============================================================
-- 038_payslips tables
-- ============================================================

GRANT ALL ON TABLE payslips TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE payslips TO authenticated;
GRANT SELECT ON TABLE payslips TO anon;

-- ============================================================
-- 039_document_supply_requests tables
-- ============================================================

GRANT ALL ON TABLE document_requests TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE document_requests TO authenticated;
GRANT SELECT ON TABLE document_requests TO anon;

GRANT ALL ON TABLE supply_requests TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE supply_requests TO authenticated;
GRANT SELECT ON TABLE supply_requests TO anon;

GRANT ALL ON TABLE supply_request_items TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE supply_request_items TO authenticated;
GRANT SELECT ON TABLE supply_request_items TO anon;

GRANT ALL ON TABLE supply_approval_steps TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE supply_approval_steps TO authenticated;
GRANT SELECT ON TABLE supply_approval_steps TO anon;

-- ============================================================
-- 044_expense_sensitive_data tables
-- No client access: service_role only (blocked by RLS, no client policies)
-- ============================================================

GRANT ALL ON TABLE expense_sensitive_data TO service_role;

-- ============================================================
-- 055_encrypt_card_number tables
-- No client access: service_role only (blocked by RLS, no client policies)
-- ============================================================

GRANT ALL ON TABLE expense_card_sensitive_data TO service_role;

-- ============================================================
-- 066_doc_numbers tables
-- ============================================================

GRANT ALL ON TABLE doc_number_counters TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE doc_number_counters TO authenticated;
GRANT SELECT ON TABLE doc_number_counters TO anon;

-- ============================================================
-- 075_work_diaries tables
-- ============================================================

GRANT ALL ON TABLE work_diaries TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE work_diaries TO authenticated;
GRANT SELECT ON TABLE work_diaries TO anon;

-- ============================================================
-- 078_agent_installations tables
-- ============================================================

GRANT ALL ON TABLE agent_installations TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE agent_installations TO authenticated;
GRANT SELECT ON TABLE agent_installations TO anon;

-- ============================================================
-- 082_subscriptions tables
-- ============================================================

GRANT ALL ON TABLE subscriptions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE subscriptions TO authenticated;
GRANT SELECT ON TABLE subscriptions TO anon;
