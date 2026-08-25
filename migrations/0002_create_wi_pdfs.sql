CREATE TABLE IF NOT EXISTS wi_pdfs (
  document_key TEXT PRIMARY KEY,
  object_key TEXT NOT NULL,
  file_name TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
  uploaded_at TEXT NOT NULL
);
