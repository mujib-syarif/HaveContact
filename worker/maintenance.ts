export async function cleanupExpiredOperationalData(db: D1Database): Promise<void> {
  const expiredReports = `SELECT id FROM reports
    WHERE (status IN ('pending','rejected') AND created_at < strftime('%Y-%m-%dT%H:%M:%fZ','now','-30 days'))
       OR (status='approved' AND created_at < strftime('%Y-%m-%dT%H:%M:%fZ','now','-180 days'))`;

  await db.batch([
    db.prepare("DELETE FROM moderation_logs WHERE created_at < strftime('%Y-%m-%dT%H:%M:%fZ','now','-365 days') OR report_id IN (" + expiredReports + ")"),
    db.prepare("DELETE FROM reports WHERE (status IN ('pending','rejected') AND created_at < strftime('%Y-%m-%dT%H:%M:%fZ','now','-30 days')) OR (status='approved' AND created_at < strftime('%Y-%m-%dT%H:%M:%fZ','now','-180 days'))"),
    db.prepare("DELETE FROM phone_index WHERE NOT EXISTS (SELECT 1 FROM reports WHERE reports.phone_hash=phone_index.phone_hash)"),
    db.prepare("DELETE FROM request_limits WHERE updated_at < strftime('%Y-%m-%dT%H:%M:%fZ','now','-7 days')"),
    db.prepare("DELETE FROM abuse_events WHERE created_at < strftime('%Y-%m-%dT%H:%M:%fZ','now','-90 days')"),
    db.prepare("DELETE FROM community_feedback WHERE created_at < strftime('%Y-%m-%dT%H:%M:%fZ','now','-90 days')"),
    db.prepare("DELETE FROM business_claims WHERE (status IN ('pending','rejected') AND created_at < strftime('%Y-%m-%dT%H:%M:%fZ','now','-90 days')) OR (status='approved' AND reviewed_at < strftime('%Y-%m-%dT%H:%M:%fZ','now','-365 days'))"),
    db.prepare(`DELETE FROM identity_claims WHERE (status IN ('pending','rejected','withdrawn','revoked') AND created_at < strftime('%Y-%m-%dT%H:%M:%fZ','now','-90 days')) OR (status='approved' AND (reviewed_at < strftime('%Y-%m-%dT%H:%M:%fZ','now','-365 days') OR expires_at < strftime('%Y-%m-%dT%H:%M:%fZ','now','-30 days')))`)
  ]);
}
