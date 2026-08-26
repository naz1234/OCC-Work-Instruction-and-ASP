CREATE TABLE IF NOT EXISTS document_text_overrides (
  document_key TEXT PRIMARY KEY,
  title TEXT,
  folder TEXT,
  updated_at TEXT NOT NULL
);
