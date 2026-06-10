-- annual_leave_days를 NUMERIC(4,1)로 변경: 1년 미만 직원 소수점 발생 연차 지원
ALTER TABLE employees ALTER COLUMN annual_leave_days TYPE NUMERIC(4,1);
