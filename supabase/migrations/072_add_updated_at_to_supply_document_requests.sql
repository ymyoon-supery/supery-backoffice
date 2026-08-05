-- 072_add_updated_at_to_supply_document_requests.sql
--
-- document_requests and supply_requests were created without updated_at.
-- Migration 071 RPCs reference updated_at = now(), causing runtime errors.
-- Add the column to both tables and wire up the existing set_updated_at trigger.

ALTER TABLE document_requests
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

ALTER TABLE supply_requests
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE TRIGGER trg_document_requests_updated_at
  BEFORE UPDATE ON document_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_supply_requests_updated_at
  BEFORE UPDATE ON supply_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
