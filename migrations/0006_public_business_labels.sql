ALTER TABLE reports ADD COLUMN public_label TEXT;
CREATE INDEX IF NOT EXISTS idx_reports_phone_label_status ON reports(phone_hash, status, public_label);
