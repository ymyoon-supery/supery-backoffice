-- ============================================================
-- 034_backfill_waiting_steps.sql
-- 기존 데이터 백필: step1(팀장)이 아직 PENDING인 step2(admin)를
-- PENDING → WAITING으로 변경하여 전결 섹션에 노출
-- ============================================================

UPDATE leave_approval_steps step2
SET status = 'WAITING'
WHERE step2.step_order = 2
  AND step2.status = 'PENDING'
  AND EXISTS (
    SELECT 1 FROM leave_approval_steps step1
    WHERE step1.leave_request_id = step2.leave_request_id
      AND step1.step_order = 1
      AND step1.status = 'PENDING'
  );

UPDATE expense_approval_steps step2
SET status = 'WAITING'
WHERE step2.step_order = 2
  AND step2.status = 'PENDING'
  AND EXISTS (
    SELECT 1 FROM expense_approval_steps step1
    WHERE step1.expense_report_id = step2.expense_report_id
      AND step1.step_order = 1
      AND step1.status = 'PENDING'
  );
