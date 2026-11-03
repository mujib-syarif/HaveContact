import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

type Row = Record<string, unknown>;
const MIGRATIONS = join(process.cwd(), "migrations");

/** Real SQLite (node:sqlite) behind the small slice of the D1 API the Worker uses. */
export function createTestD1(options: { upTo?: string } = {}) {
  const raw = new DatabaseSync(":memory:");
  const files = readdirSync(MIGRATIONS).filter(f => f.endsWith(".sql")).sort();
  for (const file of files) {
    if (options.upTo && file > options.upTo) break;
    raw.exec(readFileSync(join(MIGRATIONS, file), "utf8"));
  }
  return { db: wrap(raw), raw, applyMigration: (file: string) => raw.exec(readFileSync(join(MIGRATIONS, file), "utf8")) };
}

function wrap(raw: DatabaseSync) {
  const statement = (sql: string, args: unknown[] = []) => ({
    bind: (...values: unknown[]) => statement(sql, values),
    first: async <T = Row>(): Promise<T | null> => (raw.prepare(sql).get(...(args as never[])) as T | undefined) ?? null,
    all: async <T = Row>() => ({ results: raw.prepare(sql).all(...(args as never[])) as T[] }),
    run: async () => {
      const info = raw.prepare(sql).run(...(args as never[]));
      return { meta: { changes: Number(info.changes) } };
    },
    __exec: () => Number(raw.prepare(sql).run(...(args as never[])).changes)
  });
  return {
    prepare: (sql: string) => statement(sql),
    batch: async (statements: ReturnType<typeof statement>[]) => {
      raw.exec("BEGIN");
      try {
        const results = statements.map(s => ({ meta: { changes: s.__exec() } }));
        raw.exec("COMMIT");
        return results;
      } catch (error) {
        raw.exec("ROLLBACK");
        throw error;
      }
    }
  } as unknown as D1Database;
}
