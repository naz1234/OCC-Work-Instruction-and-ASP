CREATE TABLE IF NOT EXISTS document_overrides (
  document_key TEXT PRIMARY KEY,
  line TEXT NOT NULL,
  condition TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
