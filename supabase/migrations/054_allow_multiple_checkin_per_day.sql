-- Allow multiple CHECK_IN / CHECK_OUT per day per employee.
-- Previously uniq_attendance_daily_main enforced one arrival and one departure
-- per KST day. Dropping it enables mid-day leave-and-return workflows where
-- total working time is accumulated across all sessions.
DROP INDEX IF EXISTS uniq_attendance_daily_main;
