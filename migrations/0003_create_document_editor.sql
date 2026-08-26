CREATE TABLE IF NOT EXISTS custom_documents (
  document_key TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  reference TEXT NOT NULL,
  line TEXT NOT NULL,
  condition TEXT NOT NULL,
  folder TEXT NOT NULL,
  group_name TEXT NOT NULL,
  link_title TEXT NOT NULL,
  url TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS removed_documents (
  document_key TEXT PRIMARY KEY,
  removed_at TEXT NOT NULL
);
