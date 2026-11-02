PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS phone_index (
  phone_hash TEXT PRIMARY KEY,
  country_calling_code TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  phone_hash TEXT NOT NULL REFERENCES phone_index(phone_hash),
  category TEXT NOT NULL CHECK (category IN ('spam','scam','telemarketing','business','other')),
  description TEXT NOT NULL CHECK (length(description) BETWEEN 10 AND 500),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  moderated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_reports_phone_status ON reports(phone_hash, status);
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports(created_at);

CREATE TABLE IF NOT EXISTS moderation_logs (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL REFERENCES reports(id),
  action TEXT NOT NULL CHECK (action IN ('approved','rejected')),
  moderator_ref TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS abuse_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);