import { describe, expect, it, vi } from "vitest";
import { cleanupExpiredOperationalData } from "../worker/maintenance";

describe("operational data retention", () => {
  it("prunes expired reports, audit history, orphaned hashes and operational data in FK-safe order", async () => {
    const statements: string[] = [];
    const db = {
      prepare: (sql: string) => {
        statements.push(sql);
        return { bind: () => ({}) };
      },
      batch: vi.fn(async () => [])
    };
    await cleanupExpiredOperationalData(db as never);
    expect(db.batch).toHaveBeenCalledTimes(1);
    expect(statements).toHaveLength(5);
    expect(statements[0]).toContain("DELETE FROM moderation_logs");
    expect(statements[0]).toContain("-365 days");
    expect(statements[0]).toContain("-180 days");
    expect(statements[1]).toContain("DELETE FROM reports");
    expect(statements[1]).toContain("-30 days");
    expect(statements[1]).toContain("-180 days");
    expect(statements[2]).toContain("DELETE FROM phone_index");
    expect(statements[3]).toContain("request_limits");
    expect(statements[3]).toContain("-7 days");
    expect(statements[4]).toContain("abuse_events");
    expect(statements[4]).toContain("-90 days");
  });
});
