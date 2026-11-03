CREATE TABLE IF NOT EXISTS identity_claims (
  id TEXT PRIMARY KEY,
  phone_hash TEXT NOT NULL,
  display_name TEXT NOT NULL CHECK (length(display_name) BETWEEN 2 AND 80),
  public_profile_url TEXT NOT NULL,
  consent_public INTEGER NOT NULL CHECK (consent_public = 1),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  review_note TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  reviewed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_identity_claims_phone_status ON identity_claims(phone_hash,status);
CREATE INDEX IF NOT EXISTS idx_identity_claims_status_created ON identity_claims(status,created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_identity_claims_one_pending_per_phone ON identity_claims(phone_hash) WHERE status='pending';
