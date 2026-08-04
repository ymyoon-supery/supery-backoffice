-- 070_fix_historical_supply_approved_steps.sql
--
-- Back-fill: for supply_requests already in REJECTED status,
-- update any approval step that is still APPROVED to REJECTED
-- and carry over the rejection comment from the step that actually rejected.
--
-- Migration 068 fixed approve_supply_step() going forward but did not
-- touch historical rows. This migration patches those rows so that
-- prior approvers (e.g. team leads at step 1) can see the rejection
-- reason in their 결재완료 list.

UPDATE supply_approval_steps sas
SET
  status  = 'REJECTED',
  comment = (
    SELECT src.comment
    FROM supply_approval_steps src
    WHERE src.supply_request_id = sas.supply_request_id
      AND src.status = 'REJECTED'
      AND src.comment IS NOT NULL
    ORDER BY src.step_order DESC
    LIMIT 1
  )
FROM supply_requests sr
WHERE sas.supply_request_id = sr.id
  AND sr.status = 'REJECTED'
  AND sas.status = 'APPROVED';
