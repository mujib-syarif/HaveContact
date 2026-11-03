import { describe, expect, it, vi } from "vitest";
import { cleanupExpiredOperationalData } from "../worker/maintenance";

describe("operational data retention", () => {
  it("prunes expired rate-limit buckets and old abuse events in one D1 batch", async () => {
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
    expect(statements).toHaveLength(2);
    expect(statements[0]).toContain("request_limits");
    expect(statements[0]).toContain("-7 days");
    expect(statements[1]).toContain("abuse_events");
    expect(statements[1]).toContain("-90 days");
  });
});
