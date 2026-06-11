ALTER TABLE company_settings
  ADD COLUMN auto_break_mode TEXT NOT NULL DEFAULT 'frontend'
  CHECK (auto_break_mode IN ('frontend', 'server'));
