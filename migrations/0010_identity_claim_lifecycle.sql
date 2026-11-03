-- Identity claim lifecycle: consent timestamp, expiry, withdrawal, revocation,
-- owner withdrawal token (stored only as an HMAC) and stricter constraints.
--
-- SQLite cannot alter a CHECK constraint in place, so the table is rebuilt.
-- Safe for data created by 0009:
--   * every existing row is copied;
--   * consent_at falls back to created_at;
--   * approved rows get expires_at = reviewed_at + 365 days;
--   * if more than one approved row exists for a phone hash, only the newest
--     stays approved and the rest become 'revoked' so the new unique index
--     cannot fail the migration.
-- Rows without a withdrawal token can still be revoked by an administrator.

CREATE TABLE identity_claims_v2 (
  id TEXT PRIMARY KEY,
  phone_hash TEXT NOT NULL CHECK (length(phone_hash) = 64),
  display_name TEXT NOT NULL CHECK (length(display_name) BETWEEN 2 AND 80),
  public_profile_url TEXT NOT NULL CHECK (public_profile_url LIKE 'https://%'),
  consent_public INTEGER NOT NULL CHECK (consent_public = 1),
  consent_at TEXT NOT NULL,
  withdrawal_token_hash TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','withdrawn','revoked')),
  review_note TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  reviewed_at TEXT,
  expires_at TEXT,
  withdrawn_at TEXT,
  CHECK (status <> 'approved' OR (reviewed_at IS NOT NULL AND expires_at IS NOT NULL)),
  CHECK (status <> 'withdrawn' OR withdrawn_at IS NOT NULL)
);

INSERT INTO identity_claims_v2
  (id, phone_hash, display_name, public_profile_url, consent_public, consent_at,
   withdrawal_token_hash, status, review_note, created_at, reviewed_at, expires_at, withdrawn_at)
SELECT
  c.id,
  c.phone_hash,
  c.display_name,
  c.public_profile_url,
  1,
  c.created_at,
  NULL,
  CASE
    WHEN c.status = 'approved' AND c.id NOT IN (
      SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (
          PARTITION BY phone_hash ORDER BY COALESCE(reviewed_at, created_at) DESC, id DESC
        ) AS rn
        FROM identity_claims WHERE status = 'approved'
      ) WHERE rn = 1
    ) THEN 'revoked'
    ELSE c.status
  END,
  c.review_note,
  c.created_at,
  CASE WHEN c.status = 'approved' THEN COALESCE(c.reviewed_at, c.created_at) ELSE c.reviewed_at END,
  CASE WHEN c.status = 'approved'
    THEN strftime('%Y-%m-%dT%H:%M:%fZ', COALESCE(c.reviewed_at, c.created_at), '+365 days')
  END,
  NULL
FROM identity_claims c
WHERE c.consent_public = 1;

DROP TABLE identity_claims;
ALTER TABLE identity_claims_v2 RENAME TO identity_claims;

CREATE INDEX idx_identity_claims_phone_status ON identity_claims(phone_hash, status);
CREATE INDEX idx_identity_claims_status_created ON identity_claims(status, created_at);
CREATE INDEX idx_identity_claims_expiry ON identity_claims(expires_at) WHERE status = 'approved';
CREATE INDEX idx_identity_claims_withdrawal_token ON identity_claims(withdrawal_token_hash) WHERE withdrawal_token_hash IS NOT NULL;
-- At most one pending and one active (approved) identity per phone hash. These
-- make duplicate and concurrent submissions fail safely at the database level.
CREATE UNIQUE INDEX idx_identity_claims_one_pending_per_phone ON identity_claims(phone_hash) WHERE status = 'pending';
CREATE UNIQUE INDEX idx_identity_claims_one_approved_per_phone ON identity_claims(phone_hash) WHERE status = 'approved';
