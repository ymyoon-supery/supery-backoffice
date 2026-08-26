-- 081_rls_missing_tables.sql
-- Enable RLS on tables created without it (Supabase security alert 2026-08-23)
-- Both tables are accessed exclusively via service_role (API routes / SECURITY DEFINER
-- triggers), so authenticated clients are denied direct access — same pattern as
-- outbox_events.

-- doc_number_counters: written only by trg_assign_doc_number (SECURITY DEFINER)
ALTER TABLE doc_number_counters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "doc_number_counters_no_client_access"
  ON doc_number_counters FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

-- agent_installations: written/read only by /api/agent/* routes (service_role)
ALTER TABLE agent_installations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_installations_no_client_access"
  ON agent_installations FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);
