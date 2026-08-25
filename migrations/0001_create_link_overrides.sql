CREATE TABLE IF NOT EXISTS link_overrides (
  document_key TEXT PRIMARY KEY,
  link_title TEXT NOT NULL,
  url TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);
 
