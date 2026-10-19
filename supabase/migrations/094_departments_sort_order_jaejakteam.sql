-- 제작팀 sort_order 추가 (093 마이그레이션 이후 적용)
UPDATE departments SET sort_order = 5 WHERE name = '제작팀';
