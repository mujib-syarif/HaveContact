export async function cleanupExpiredOperationalData(db: D1Database): Promise<void> {
  await db.batch([
    db.prepare("DELETE FROM request_limits WHERE updated_at < strftime('%Y-%m-%dT%H:%M:%fZ','now','-7 days')"),
    db.prepare("DELETE FROM abuse_events WHERE created_at < strftime('%Y-%m-%dT%H:%M:%fZ','now','-90 days')")
  ]);
}
