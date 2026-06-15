ALTER TABLE document_requests
  ADD COLUMN IF NOT EXISTS purpose TEXT;
