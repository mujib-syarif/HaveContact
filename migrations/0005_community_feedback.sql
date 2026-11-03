CREATE TABLE IF NOT EXISTS community_feedback (
  id TEXT PRIMARY KEY,
  phone_hash TEXT NOT NULL,
  request_type TEXT NOT NULL CHECK (request_type IN ('correction','abuse')),
  details TEXT NOT NULL CHECK (length(details) BETWEEN 10 AND 500),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','resolved','rejected')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  reviewed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_community_feedback_status_created
  ON community_feedback(status, created_at);
CREATE INDEX IF NOT EXISTS idx_community_feedback_created
  ON community_feedback(created_at);
