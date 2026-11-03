CREATE TABLE IF NOT EXISTS business_claims (
  id TEXT PRIMARY KEY,
  phone_hash TEXT NOT NULL,
  business_name TEXT NOT NULL CHECK (length(business_name) BETWEEN 2 AND 100),
  website TEXT NOT NULL,
  public_email TEXT,
  proof_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  review_note TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  reviewed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_business_claims_phone_status ON business_claims(phone_hash,status);
CREATE INDEX IF NOT EXISTS idx_business_claims_status_created ON business_claims(status,created_at);
