ALTER TABLE company_settings
  ADD COLUMN work_start_time  TEXT NOT NULL DEFAULT '09:00',
  ADD COLUMN work_end_time    TEXT NOT NULL DEFAULT '18:00',
  ADD COLUMN lunch_start_time TEXT NOT NULL DEFAULT '12:00',
  ADD COLUMN lunch_end_time   TEXT NOT NULL DEFAULT '13:00';
