-- 088_grant_data_api_access.sql
-- Supabase October 30 2026 policy change:
-- New tables no longer receive automatic Data API grants.
-- This migration back-fills explicit GRANTs so that supabase db reset,
-- new preview branches, and fresh project setups remain functional.
-- Existing live grants are unaffected (idempotent re-apply).

-- ── service_role only (no direct client access) ────────────────────────────
-- outbox_events, expense_sensitive_data, expense_card_sensitive_data,
-- doc_number_counters, agent_installations are blocked to authenticated via RLS.

GRANT ALL ON TABLE outbox_events              TO service_role;
GRANT ALL ON TABLE expense_sensitive_data     TO service_role;
GRANT ALL ON TABLE expense_card_sensitive_data TO service_role;
GRANT ALL ON TABLE doc_number_counters        TO service_role;
GRANT ALL ON TABLE agent_installations        TO service_role;

-- ── standard tables (authenticated + service_role) ─────────────────────────
-- RLS policies control row-level access; grants here enable table-level API access.

GRANT ALL ON TABLE departments               TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE departments               TO authenticated;
GRANT SELECT ON TABLE departments               TO anon;

GRANT ALL ON TABLE employees                 TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE employees                 TO authenticated;
GRANT SELECT ON TABLE employees                 TO anon;

GRANT ALL ON TABLE attendance_records        TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE attendance_records        TO authenticated;
GRANT SELECT ON TABLE attendance_records        TO anon;

GRANT ALL ON TABLE leave_requests            TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE leave_requests            TO authenticated;
GRANT SELECT ON TABLE leave_requests            TO anon;

GRANT ALL ON TABLE leave_approval_steps      TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE leave_approval_steps      TO authenticated;
GRANT SELECT ON TABLE leave_approval_steps      TO anon;

GRANT ALL ON TABLE expense_reports           TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE expense_reports           TO authenticated;
GRANT SELECT ON TABLE expense_reports           TO anon;

GRANT ALL ON TABLE expense_approval_steps    TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE expense_approval_steps    TO authenticated;
GRANT SELECT ON TABLE expense_approval_steps    TO anon;

GRANT ALL ON TABLE company_settings          TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE company_settings          TO authenticated;
GRANT SELECT ON TABLE company_settings          TO anon;

GRANT ALL ON TABLE home_location_requests    TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE home_location_requests    TO authenticated;
GRANT SELECT ON TABLE home_location_requests    TO anon;

GRANT ALL ON TABLE notices                   TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE notices                   TO authenticated;
GRANT SELECT ON TABLE notices                   TO anon;

GRANT ALL ON TABLE projects                  TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE projects                  TO authenticated;
GRANT SELECT ON TABLE projects                  TO anon;

GRANT ALL ON TABLE payslips                  TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE payslips                  TO authenticated;
GRANT SELECT ON TABLE payslips                  TO anon;

GRANT ALL ON TABLE document_requests         TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE document_requests         TO authenticated;
GRANT SELECT ON TABLE document_requests         TO anon;

GRANT ALL ON TABLE supply_requests           TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE supply_requests           TO authenticated;
GRANT SELECT ON TABLE supply_requests           TO anon;

GRANT ALL ON TABLE supply_request_items      TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE supply_request_items      TO authenticated;
GRANT SELECT ON TABLE supply_request_items      TO anon;

GRANT ALL ON TABLE supply_approval_steps     TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE supply_approval_steps     TO authenticated;
GRANT SELECT ON TABLE supply_approval_steps     TO anon;

GRANT ALL ON TABLE work_diaries              TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE work_diaries              TO authenticated;
GRANT SELECT ON TABLE work_diaries              TO anon;

GRANT ALL ON TABLE subscriptions             TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE subscriptions             TO authenticated;
GRANT SELECT ON TABLE subscriptions             TO anon;
