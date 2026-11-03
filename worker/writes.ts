type ModerationWrite = {
  reportId: string;
  action: "approved" | "rejected";
  reason: string | null;
  logId: string;
};

type PendingReportWrite = {
  id: string;
  phoneHash: string;
  callingCode: string | null;
  category: string;
  description: string;
  publicLabel?: string | null;
};

export async function persistModeration(
  db: D1Database,
  input: ModerationWrite
): Promise<boolean> {
  const results = await db.batch([
    db.prepare("UPDATE reports SET status=?,moderation_reason=?,moderated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND status='pending'")
      .bind(input.action, input.reason, input.reportId),
    db.prepare("INSERT INTO moderation_logs (id,report_id,action,moderator_ref,reason) SELECT ?,?,?, 'admin-api',? WHERE changes()=1")
      .bind(input.logId, input.reportId, input.action, input.reason)
  ]);
  return (results[0]?.meta?.changes ?? 0) === 1;
}

export async function createPendingReport(
  db: D1Database,
  input: PendingReportWrite
): Promise<void> {
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO phone_index (phone_hash,country_calling_code) VALUES (?,?)")
      .bind(input.phoneHash, input.callingCode),
    db.prepare("INSERT INTO reports (id,phone_hash,category,description,status,public_label) VALUES (?,?,?,?,'pending',?)")
      .bind(input.id, input.phoneHash, input.category, input.description, input.publicLabel ?? null)
  ]);
}
export async function removeReport(db: D1Database, reportId: string): Promise<boolean> {
  const results = await db.batch([
    db.prepare("DELETE FROM moderation_logs WHERE report_id=?").bind(reportId),
    db.prepare("DELETE FROM reports WHERE id=?").bind(reportId),
    db.prepare("DELETE FROM phone_index WHERE NOT EXISTS (SELECT 1 FROM reports WHERE reports.phone_hash=phone_index.phone_hash)").bind()
  ]);
  return (results[1]?.meta?.changes ?? 0) === 1;
}
