-- 보상휴가(COMP) 유형 추가
ALTER TABLE leave_requests DROP CONSTRAINT IF EXISTS leave_requests_leave_type_check;
ALTER TABLE leave_requests ADD CONSTRAINT leave_requests_leave_type_check
  CHECK (leave_type IN ('ANNUAL', 'SICK', 'HALF_DAY', 'COMP', 'OTHER'));
