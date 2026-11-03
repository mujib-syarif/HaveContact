CREATE INDEX IF NOT EXISTS idx_reports_status_created_at
  ON reports(status, created_at);

CREATE INDEX IF NOT EXISTS idx_moderation_logs_report_created
  ON moderation_logs(report_id, created_at);
