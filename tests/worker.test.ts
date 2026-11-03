import { describe, expect, it, vi } from "vitest";
import worker from "../worker/index";

function makeEnv(overrides: Record<string, unknown> = {}) {
  const db = {
    prepare: vi.fn(() => ({
      bind: vi.fn(() => ({
        all: vi.fn(async () => ({ results: [] })),
        first: vi.fn(async () => null),
        run: vi.fn(async () => ({ meta: { changes: 1 } }))
      }))
    })),
    batch: vi.fn(async () => [{ meta: { changes: 1 } }, { meta: { changes: 1 } }])
  };
  return {
    env: {
      DB: db,
      PHONE_HASH_SECRET: "test-secret",
      ADMIN_API_TOKEN: "test-admin-token",
      ALLOWED_ORIGINS: "https://havecontact.example",
      APP_ENV: "test",
      ...overrides
    },
    db
  };
}

async function json(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

describe("HaveContact Worker API", () => {
  it("serves health without requiring database configuration", async () => {
    const response = await worker.fetch(
      new Request("https://api.example/api/health"),
      { APP_ENV: "test" } as never
    );

    expect(response.status).toBe(200);
    await expect(json(response)).resolves.toMatchObject({
      ok: true,
      service: "havecontact-api",
      environment: "test"
    });
  });

  it("returns CORS headers only for an explicitly allowed origin", async () => {
    const { env } = makeEnv();
    const allowed = await worker.fetch(
      new Request("https://api.example/api/health", {
        headers: { Origin: "https://havecontact.example" }
      }),
      env as never
    );
    expect(allowed.headers.get("Access-Control-Allow-Origin")).toBe("https://havecontact.example");

    const denied = await worker.fetch(
      new Request("https://api.example/api/health", {
        headers: { Origin: "https://attacker.example" }
      }),
      env as never
    );
    expect(denied.status).toBe(403);
    expect(denied.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("rejects admin requests without a valid bearer token", async () => {
    const { env, db } = makeEnv();
    const response = await worker.fetch(
      new Request("https://api.example/api/admin/reports", {
        headers: { Authorization: "Bearer wrong-token" }
      }),
      env as never
    );

    expect(response.status).toBe(401);
    await expect(json(response)).resolves.toMatchObject({ ok: false, error: "Unauthorized" });
    expect(db.prepare).not.toHaveBeenCalled();
  });

  it("rejects an invalid moderation queue status before querying D1", async () => {
    const { env, db } = makeEnv();
    const response = await worker.fetch(
      new Request("https://api.example/api/admin/reports?status=all", {
        headers: { Authorization: "Bearer test-admin-token" }
      }),
      env as never
    );

    expect(response.status).toBe(400);
    await expect(json(response)).resolves.toMatchObject({ ok: false, error: "Invalid status" });
    expect(db.prepare).not.toHaveBeenCalled();
  });

  it("rejects malformed phone lookups before touching rate-limit storage", async () => {
    const { env, db } = makeEnv();
    const response = await worker.fetch(
      new Request("https://api.example/api/v1/lookup?phone=not-a-number"),
      env as never
    );

    expect(response.status).toBe(400);
    await expect(json(response)).resolves.toMatchObject({ ok: false, error: "Invalid phone number" });
    expect(db.prepare).not.toHaveBeenCalled();
  });

  it("fails closed when required service configuration is missing", async () => {
    const { env } = makeEnv({ PHONE_HASH_SECRET: "" });
    const response = await worker.fetch(
      new Request("https://api.example/api/v1/lookup?phone=%2B6281234567890"),
      env as never
    );

    expect(response.status).toBe(503);
    await expect(json(response)).resolves.toMatchObject({ ok: false, error: "Service is not configured" });
  });
});
