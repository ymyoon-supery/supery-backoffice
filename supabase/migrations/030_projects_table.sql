-- Projects table (migrated from supery-homepage project)
CREATE TABLE IF NOT EXISTS projects (
  id                TEXT        PRIMARY KEY,
  title             TEXT        NOT NULL,
  category          TEXT        NOT NULL,
  category_label    TEXT        NOT NULL,
  description       TEXT        NOT NULL DEFAULT '',
  image             TEXT        NOT NULL,
  hero_image        TEXT,
  in_hero           BOOLEAN     DEFAULT false,
  media             JSONB       DEFAULT '[]'::jsonb,
  featured          BOOLEAN     DEFAULT false,
  created_at        TIMESTAMPTZ DEFAULT now(),
  position          INTEGER     DEFAULT 0,
  hero_order        INTEGER,
  hero_image_mobile TEXT,
  image_mobile      TEXT
);

-- Public read access (homepage display)
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "projects_public_read"
  ON projects FOR SELECT
  USING (true);

-- Only admin can insert/update/delete
CREATE POLICY "projects_admin_write"
  ON projects FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM employees
      WHERE auth_user_id = auth.uid()
        AND role = 'ADMIN'
    )
  );
