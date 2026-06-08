-- ============================================================
-- 007_outbox_functions.sql
-- Outbox batch claim function for Vercel Cron processor
-- Uses FOR UPDATE SKIP LOCKED for safe concurrent processing
-- ============================================================

-- Claim a batch of pending outbox events for processing
-- Called by the /api/cron/outbox-process route with service_role key
CREATE OR REPLACE FUNCTION claim_outbox_batch(p_batch_size INTEGER DEFAULT 10)
RETURNS TABLE (
  id                UUID,
  idempotency_key   TEXT,
  event_type        TEXT,
  payload           JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  UPDATE outbox_events
  SET status = 'PROCESSING'
  WHERE id IN (
    SELECT oe.id
    FROM outbox_events oe
    WHERE oe.status = 'PENDING'
      AND oe.scheduled_at <= now()
    ORDER BY oe.scheduled_at
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  RETURNING
    outbox_events.id,
    outbox_events.idempotency_key,
    outbox_events.event_type,
    outbox_events.payload;
END;
$$;

-- Mark an outbox event as successfully processed
CREATE OR REPLACE FUNCTION complete_outbox_event(p_event_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE outbox_events
  SET status = 'DONE',
      processed_at = now()
  WHERE id = p_event_id;
END;
$$;

-- Mark an outbox event as failed (increments retry_count)
-- Schedules retry with exponential backoff up to 5 attempts
CREATE OR REPLACE FUNCTION fail_outbox_event(p_event_id UUID, p_error TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_retry_count INTEGER;
BEGIN
  SELECT retry_count INTO v_retry_count
  FROM outbox_events WHERE id = p_event_id;

  IF v_retry_count >= 4 THEN
    UPDATE outbox_events
    SET status = 'FAILED',
        last_error = p_error,
        retry_count = retry_count + 1
    WHERE id = p_event_id;
  ELSE
    -- Exponential backoff: 1min, 5min, 25min, 2hr
    UPDATE outbox_events
    SET status = 'PENDING',
        last_error = p_error,
        retry_count = retry_count + 1,
        scheduled_at = now() + (INTERVAL '1 minute' * POWER(5, retry_count))
    WHERE id = p_event_id;
  END IF;
END;
$$;
