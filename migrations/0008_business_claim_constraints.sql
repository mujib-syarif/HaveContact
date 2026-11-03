CREATE UNIQUE INDEX IF NOT EXISTS idx_business_claims_one_pending_per_phone
ON business_claims(phone_hash)
WHERE status = 'pending';
