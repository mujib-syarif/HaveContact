import { describe, expect, it, vi } from "vitest";
import { createPendingReport, persistModeration, removeReport } from "../worker/writes";

function fakeDatabase(changes = 1) {
  const statements: Array<{ sql: string; values: unknown[] }> = [];
  const db = {
    prepare: (sql: string) => ({
      bind: (...values: unknown[]) => {
        statements.push({ sql, values });
        return { sql, values };
      }
    }),
    batch: vi.fn(async () => [{ meta: { changes } }, { meta: { changes: 1 } }])
  };
  return { db: db as unknown as Parameters<typeof persistModeration>[0], statements, batch: db.batch };
}

describe("atomic D1 writes", () => {
  it("updates a report and writes its audit entry in one batch", async () => {
    const mock = fakeDatabase(1);
    const changed = await persistModeration(mock.db, {
      reportId: "report-id",
      action: "rejected",
      reason: "Insufficient evidence",
      logId: "log-id"
    });

    expect(changed).toBe(true);
    expect(mock.batch).toHaveBeenCalledTimes(1);
    expect(mock.statements).toHaveLength(2);
    expect(mock.statements[0].sql).toContain("status='pending'");
    expect(mock.statements[1].sql).toContain("WHERE changes()=1");
  });

  it("reports a conflict when another moderator already changed the report", async () => {
    const mock = fakeDatabase(0);
    const changed = await persistModeration(mock.db, {
      reportId: "report-id",
      action: "approved",
      reason: null,
      logId: "log-id"
    });

    expect(changed).toBe(false);
    expect(mock.batch).toHaveBeenCalledTimes(1);
  });

  it("creates the phone index and pending report in one batch", async () => {
    const mock = fakeDatabase();
    await createPendingReport(mock.db, {
      id: "report-id",
      phoneHash: "hashed-number",
      callingCode: "62",
      category: "spam",
      description: "Repeated unsolicited calls"
    });

    expect(mock.batch).toHaveBeenCalledTimes(1);
    expect(mock.statements).toHaveLength(2);
    expect(mock.statements[0].sql).toContain("INSERT OR IGNORE INTO phone_index");
    expect(mock.statements[1].sql).toContain("INSERT INTO reports");
  });
  it("removes report content and moderation history atomically", async () => {
    const mock = fakeDatabase();
    const removed = await removeReport(mock.db, "report-id");
    expect(removed).toBe(true);
    expect(mock.batch).toHaveBeenCalledTimes(1);
    expect(mock.statements).toHaveLength(3);
    expect(mock.statements[0].sql).toContain("DELETE FROM moderation_logs");
    expect(mock.statements[1].sql).toContain("DELETE FROM reports");
    expect(mock.statements[2].sql).toContain("DELETE FROM phone_index");
  });

});
