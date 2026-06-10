-- ============================================================
-- 008_heartbeat_anomaly.sql
-- Adds last_heartbeat to employees for auto-checkout tracking
-- Adds is_anomaly flag to attendance_records for admin review
-- ============================================================

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS last_heartbeat TIMESTAMPTZ;

ALTER TABLE attendance_records
  ADD COLUMN IF NOT EXISTS is_anomaly BOOLEAN NOT NULL DEFAULT false;
