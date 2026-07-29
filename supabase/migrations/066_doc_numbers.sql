-- 066_doc_numbers.sql
-- Auto-assign sequential document numbers on INSERT.
-- Format: EXP-YYYYMM-NNN  DOC-YYYYMM-NNN  SUP-YYYYMM-NNN  (KST)
-- Counter is per-prefix per-month; INSERT ON CONFLICT ... DO UPDATE is atomic.

CREATE TABLE IF NOT EXISTS doc_number_counters (
  prefix      TEXT NOT NULL,
  year_month  TEXT NOT NULL,
  last_seq    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (prefix, year_month)
);

ALTER TABLE expense_reports   ADD COLUMN IF NOT EXISTS doc_number TEXT UNIQUE;
ALTER TABLE document_requests ADD COLUMN IF NOT EXISTS doc_number TEXT UNIQUE;
ALTER TABLE supply_requests   ADD COLUMN IF NOT EXISTS doc_number TEXT UNIQUE;

CREATE OR REPLACE FUNCTION trg_assign_doc_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $func$
DECLARE
  v_prefix TEXT;
  v_seq    INTEGER;
  v_ym     TEXT;
BEGIN
  v_ym := to_char((NOW() AT TIME ZONE 'Asia/Seoul'), 'YYYYMM');

  IF    TG_TABLE_NAME = 'expense_reports'   THEN v_prefix := 'EXP';
  ELSIF TG_TABLE_NAME = 'document_requests' THEN v_prefix := 'DOC';
  ELSIF TG_TABLE_NAME = 'supply_requests'   THEN v_prefix := 'SUP';
  ELSE  RETURN NEW;
  END IF;

  INSERT INTO doc_number_counters (prefix, year_month, last_seq)
  VALUES (v_prefix, v_ym, 1)
  ON CONFLICT (prefix, year_month) DO UPDATE
    SET last_seq = doc_number_counters.last_seq + 1
  RETURNING last_seq INTO v_seq;

  NEW.doc_number := v_prefix || '-' || v_ym || '-' || lpad(v_seq::TEXT, 3, '0');
  RETURN NEW;
END;
$func$;

-- Fire only when doc_number is not already set (allows explicit override)
CREATE TRIGGER trg_expense_reports_doc_number
  BEFORE INSERT ON expense_reports
  FOR EACH ROW WHEN (NEW.doc_number IS NULL)
  EXECUTE FUNCTION trg_assign_doc_number();

CREATE TRIGGER trg_document_requests_doc_number
  BEFORE INSERT ON document_requests
  FOR EACH ROW WHEN (NEW.doc_number IS NULL)
  EXECUTE FUNCTION trg_assign_doc_number();

CREATE TRIGGER trg_supply_requests_doc_number
  BEFORE INSERT ON supply_requests
  FOR EACH ROW WHEN (NEW.doc_number IS NULL)
  EXECUTE FUNCTION trg_assign_doc_number();
