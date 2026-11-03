import { afterEach, beforeEach, describe, expect, it } from "vitest";
import worker from "../worker/index";
import { cleanupExpiredOperationalData } from "../worker/maintenance";
import { createTestD1 } from "./helpers/d1";

const ADMIN = "test-admin-token-value-at-least-32-chars";
const PHONE = "+6281234567890";
const PHONE_B = "+12133734253";
const PHONE_C = "+442071838750";
const PROOF = "https://example.org/profil/budi";
const realFetch = globalThis.fetch;
let ip = 0;
let turnstileOk = true;
let ctx: ReturnType<typeof createTestD1>;
let env: Record<string, unknown>;

beforeEach(() => {
  ctx = createTestD1();
  turnstileOk = true;
  env = {
    DB: ctx.db,
    PHONE_HASH_SECRET: "test-secret-value-that-is-at-least-thirty-two-characters",
    ADMIN_API_TOKEN: ADMIN,
    TURNSTILE_SECRET: "turnstile-test-secret",
    ALLOWED_ORIGINS: "https://havecontact.example",
    APP_ENV: "test"
  };
  globalThis.fetch = (async () => new Response(JSON.stringify({ success: turnstileOk }))) as typeof fetch;
});
afterEach(() => { globalThis.fetch = realFetch; });

async function call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const response = await worker.fetch(new Request(`https://api.example${path}`, {
    method,
    headers: { "CF-Connecting-IP": `203.0.113.${(ip++ % 250) + 1}`, "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body)
  }), env as never);
  return { status: response.status, body: await response.json() as Record<string, any> };
}
const admin = { Authorization: `Bearer ${ADMIN}` };
const turnstile = { "X-Turnstile-Token": "ok-token" };
const submission = (over: Record<string, unknown> = {}) => ({ phone: PHONE, displayName: "Budi Santoso", publicProfileUrl: PROOF, consentPublic: true, ...over });
const submit = (over: Record<string, unknown> = {}, headers = turnstile) => call("POST", "/api/v1/identity-claims", submission(over), headers);
const rows = () => ctx.raw.prepare("SELECT * FROM identity_claims").all() as Record<string, any>[];
const lookup = async (phone = PHONE) => (await call("GET", `/api/v1/lookup?phone=${encodeURIComponent(phone)}`)).body.result;
const pendingId = () => rows().find(r => r.status === "pending")!.id as string;
const approve = (id: string, over: Record<string, unknown> = {}) =>
  call("POST", `/api/admin/identity-claims/${id}/moderate`, { action: "approved", phone: PHONE, evidenceConfirmed: true, note: "Halaman profil memuat nama dan nomor yang sama.", ...over }, admin);

describe("identity enrollment", () => {
  it("1. accepts a valid, consented, Turnstile-verified submission as pending and stores no raw phone", async () => {
    const res = await submit();
    expect(res.status).toBe(201);
    expect(res.body.claim).toEqual({ status: "pending" });
    expect(res.body.withdrawalToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const stored = rows();
    expect(stored).toHaveLength(1);
    expect(stored[0].status).toBe("pending");
    expect(stored[0].phone_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(stored)).not.toContain("81234567890");
    expect(stored[0].withdrawal_token_hash).not.toBe(res.body.withdrawalToken);
  });

  it("2. rejects a submission without explicit consent", async () => {
    for (const consentPublic of [false, undefined, "true", 1]) {
      expect((await submit({ consentPublic })).status).toBe(400);
    }
    expect(rows()).toHaveLength(0);
  });

  it("3. rejects invalid phone numbers", async () => {
    for (const phone of ["abc", "123", "", null]) expect((await submit({ phone })).status).toBe(400);
    expect(rows()).toHaveLength(0);
  });

  it("4. rejects non-HTTPS, local, credentialed and IP-literal proof URLs", async () => {
    const bad = ["http://example.org/x", "https://localhost/x", "https://user:pw@example.org/x", "https://192.168.1.10/x", "javascript:alert(1)", "https://example.org:8443/x", "not a url", "https://intranet/x"];
    for (const publicProfileUrl of bad) expect((await submit({ publicProfileUrl })).status).toBe(400);
    expect(rows()).toHaveLength(0);
  });

  it("5. stores nothing when Turnstile verification fails or the token is missing", async () => {
    turnstileOk = false;
    expect((await submit()).status).toBe(403);
    turnstileOk = true;
    expect((await submit({}, {} as never)).status).toBe(403);
    expect(rows()).toHaveLength(0);
  });

  it("6. rejects a duplicate pending submission for the same number", async () => {
    expect((await submit()).status).toBe(201);
    const second = await submit({ displayName: "Orang Lain" });
    expect(second.status).toBe(409);
    expect(rows()).toHaveLength(1);
  });

  it("7. keeps exactly one row when duplicate submissions race", async () => {
    const results = await Promise.all([submit(), submit()]);
    expect(results.map(r => r.status).sort()).toEqual([201, 409]);
    expect(rows()).toHaveLength(1);
  });

  it("7b. limits submissions per phone number across different IP addresses", async () => {
    await submit();
    await call("POST", `/api/admin/identity-claims/${pendingId()}/moderate`, { action: "rejected", note: "Bukti tidak memuat nomor." }, admin);
    await submit();
    await call("POST", `/api/admin/identity-claims/${pendingId()}/moderate`, { action: "rejected", note: "Bukti tidak memuat nomor." }, admin);
    expect((await submit()).status).toBe(429);
    expect(rows()).toHaveLength(2);
  });

  it("allows a new submission only after the previous one is rejected", async () => {
    await submit();
    await call("POST", `/api/admin/identity-claims/${pendingId()}/moderate`, { action: "rejected", note: "Bukti tidak memuat nomor." }, admin);
    expect((await submit()).status).toBe(201);
    expect(rows()).toHaveLength(2);
  });
});

describe("identity moderation", () => {
  it("8. refuses every moderation endpoint without the admin token", async () => {
    await submit();
    const id = pendingId();
    expect((await call("GET", "/api/admin/identity-claims")).status).toBe(401);
    expect((await call("GET", "/api/admin/identity-claims", undefined, { Authorization: "Bearer nope" })).status).toBe(401);
    expect((await call("POST", `/api/admin/identity-claims/${id}/moderate`, { action: "approved" })).status).toBe(401);
    expect((await call("POST", `/api/admin/identity-claims/${id}/revoke`, { note: "alasan cukup" })).status).toBe(401);
    expect(rows()[0].status).toBe("pending");
  });

  it("lists claims with timestamps and duplicate markers, never the full hash", async () => {
    await submit();
    const list = await call("GET", "/api/admin/identity-claims?status=pending", undefined, admin);
    expect(list.status).toBe(200);
    const claim = list.body.claims[0];
    expect(claim.phone_fingerprint).toHaveLength(12);
    expect(claim).toHaveProperty("created_at");
    expect(claim).toHaveProperty("consent_at");
    expect(claim).not.toHaveProperty("phone_hash");
    expect(claim).not.toHaveProperty("withdrawal_token_hash");
    expect((await call("GET", "/api/admin/identity-claims?status=bogus", undefined, admin)).status).toBe(400);
  });

  it("9. approval requires confirmed evidence, a matching number and a note", async () => {
    await submit();
    const id = pendingId();
    expect((await approve(id, { evidenceConfirmed: false })).status).toBe(400);
    expect((await approve(id, { note: "pendek" })).status).toBe(400);
    expect((await approve(id, { phone: "" })).status).toBe(400);
    expect((await approve(id, { phone: PHONE_B })).status).toBe(422);
    expect(rows()[0].status).toBe("pending");
    const ok = await approve(id);
    expect(ok.status).toBe(200);
    const row = rows()[0];
    expect(row.status).toBe("approved");
    expect(row.reviewed_at).toBeTruthy();
    expect(Date.parse(row.expires_at)).toBeGreaterThan(Date.now() + 360 * 86400_000);
    expect((await approve(id)).status).toBe(409);
  });

  it("10. rejection needs a reason and is final", async () => {
    await submit();
    const id = pendingId();
    expect((await call("POST", `/api/admin/identity-claims/${id}/moderate`, { action: "rejected" }, admin)).status).toBe(400);
    const res = await call("POST", `/api/admin/identity-claims/${id}/moderate`, { action: "rejected", note: "Bukti tidak memuat nomor." }, admin);
    expect(res.status).toBe(200);
    expect(rows()[0].status).toBe("rejected");
    expect((await approve(id)).status).toBe(409);
  });

  it("re-registration after an approval expires can be approved again", async () => {
    await submit();
    await approve(pendingId());
    ctx.raw.prepare("UPDATE identity_claims SET expires_at='2020-01-01T00:00:00.000Z'").run();
    expect((await submit({ displayName: "Budi S." })).status).toBe(201);
    expect((await approve(pendingId())).status).toBe(200);
    const result = await lookup();
    expect(result.identity.name).toBe("Budi S.");
    expect(rows().filter(r => r.status === "approved")).toHaveLength(1);
  });
});

describe("public lookup", () => {
  it("11. returns the approved identity with only public fields", async () => {
    await submit();
    await approve(pendingId());
    const result = await lookup();
    expect(result.identity).toMatchObject({ name: "Budi Santoso", proofUrl: PROOF, verified: true, verificationType: "opt-in-public-identity" });
    expect(Object.keys(result.identity).sort()).toEqual(["approvedAt", "name", "proofUrl", "verificationType", "verified"]);
    const text = JSON.stringify(result);
    expect(text).not.toContain(rows()[0].phone_hash);
    expect(text).not.toContain(rows()[0].id);
    expect(text).not.toContain("Halaman profil memuat");
  });

  it("12. never exposes a pending identity", async () => {
    await submit();
    expect((await lookup()).identity).toBeNull();
  });

  it("13. never exposes a rejected identity or its reason", async () => {
    await submit();
    await call("POST", `/api/admin/identity-claims/${pendingId()}/moderate`, { action: "rejected", note: "alasan rahasia penolakan" }, admin);
    const result = await lookup();
    expect(result.identity).toBeNull();
    expect(JSON.stringify(result)).not.toContain("alasan rahasia");
  });

  it("14. never exposes an expired identity", async () => {
    await submit();
    await approve(pendingId());
    expect((await lookup()).identity).not.toBeNull();
    ctx.raw.prepare("UPDATE identity_claims SET expires_at='2020-01-01T00:00:00.000Z'").run();
    expect((await lookup()).identity).toBeNull();
  });

  it("15. removes an identity once the owner withdraws it", async () => {
    const created = await submit();
    await approve(pendingId());
    expect((await lookup()).identity).not.toBeNull();
    const status = await call("POST", "/api/v1/identity-claims/status", { withdrawalToken: created.body.withdrawalToken });
    expect(status.body.claim.status).toBe("approved");
    expect((await call("POST", "/api/v1/identity-claims/withdraw", { withdrawalToken: "x".repeat(43) })).status).toBe(404);
    expect((await call("POST", "/api/v1/identity-claims/withdraw", { withdrawalToken: "short" })).status).toBe(400);
    expect((await call("POST", "/api/v1/identity-claims/withdraw", { withdrawalToken: created.body.withdrawalToken })).status).toBe(200);
    expect((await lookup()).identity).toBeNull();
    expect(rows()[0].status).toBe("withdrawn");
    expect((await call("POST", "/api/v1/identity-claims/withdraw", { withdrawalToken: created.body.withdrawalToken })).status).toBe(404);
  });

  it("15b. removes an identity once an administrator revokes it", async () => {
    await submit();
    const id = pendingId();
    await approve(id);
    expect((await call("POST", `/api/admin/identity-claims/${id}/revoke`, { note: "x" }, admin)).status).toBe(400);
    expect((await call("POST", `/api/admin/identity-claims/${id}/revoke`, { note: "Pemilik meminta penghapusan." }, admin)).status).toBe(200);
    expect((await lookup()).identity).toBeNull();
    expect(rows()[0].status).toBe("revoked");
  });

  it("does not leak one number's identity into another number's lookup", async () => {
    await submit();
    await approve(pendingId());
    expect((await lookup(PHONE_C)).identity).toBeNull();
  });
});

describe("retention", () => {
  it("16. deletes stale non-public claims and keeps recent or active ones", async () => {
    const insert = ctx.raw.prepare(
      "INSERT INTO identity_claims (id,phone_hash,display_name,public_profile_url,consent_public,consent_at,status,created_at,reviewed_at,expires_at) VALUES (?,?,?,?,1,?,?,?,?,?)"
    );
    const h = (c: string) => c.repeat(64);
    const old = "2020-01-01T00:00:00.000Z";
    const future = new Date(Date.now() + 200 * 86400_000).toISOString();
    const recent = new Date().toISOString();
    insert.run("old-pending", h("1"), "Aa", PROOF, old, "pending", old, null, null);
    insert.run("old-rejected", h("2"), "Aa", PROOF, old, "rejected", old, old, null);
    ctx.raw.prepare(
      "INSERT INTO identity_claims (id,phone_hash,display_name,public_profile_url,consent_public,consent_at,status,created_at,withdrawn_at) VALUES ('old-withdrawn',?,'Aa',?,1,?,'withdrawn',?,?)"
    ).run(h("3"), PROOF, old, old, old);
    insert.run("old-revoked", h("4"), "Aa", PROOF, old, "revoked", old, null, null);
    insert.run("old-approved", h("5"), "Aa", PROOF, old, "approved", old, old, old);
    insert.run("fresh-pending", h("6"), "Aa", PROOF, recent, "pending", recent, null, null);
    insert.run("active-approved", h("7"), "Aa", PROOF, recent, "approved", recent, recent, future);
    await cleanupExpiredOperationalData(ctx.db);
    expect(rows().map(r => r.id).sort()).toEqual(["active-approved", "fresh-pending"]);
  });
});

describe("migration 0010 on existing data", () => {
  it("upgrades 0009 rows safely and collapses duplicate approvals", () => {
    const old = createTestD1({ upTo: "0009_identity_claims.sql" });
    const insert = old.raw.prepare("INSERT INTO identity_claims (id,phone_hash,display_name,public_profile_url,consent_public,status,created_at,reviewed_at) VALUES (?,?,?,?,1,?,?,?)");
    insert.run("a", "a".repeat(64), "Budi", PROOF, "approved", "2026-01-01T00:00:00.000Z", "2026-01-02T00:00:00.000Z");
    insert.run("b", "a".repeat(64), "Budi 2", PROOF, "approved", "2026-02-01T00:00:00.000Z", "2026-02-02T00:00:00.000Z");
    insert.run("c", "b".repeat(64), "Sari", PROOF, "pending", "2026-03-01T00:00:00.000Z", null);
    old.applyMigration("0010_identity_claim_lifecycle.sql");
    const migrated = old.raw.prepare("SELECT id,status,expires_at FROM identity_claims ORDER BY id").all() as Record<string, any>[];
    expect(migrated.map(r => [r.id, r.status])).toEqual([["a", "revoked"], ["b", "approved"], ["c", "pending"]]);
    expect(migrated[1].expires_at).toBeTruthy();
  });
});

describe("existing features keep working", () => {
  it("17. business verification: submit, approve, then appears as a verified business profile", async () => {
    const created = await call("POST", "/api/v1/business-claims", { phone: PHONE_B, businessName: "Toko Maju", website: "https://tokomaju.example.org", proofUrl: "https://tokomaju.example.org/kontak" }, turnstile);
    expect(created.status).toBe(201);
    expect((await lookup(PHONE_B)).businessProfiles).toEqual([]);
    const approved = await call("POST", `/api/admin/business-claims/${created.body.claim.id}/moderate`, { action: "approved" }, admin);
    expect(approved.status).toBe(200);
    const result = await lookup(PHONE_B);
    expect(result.businessProfiles[0]).toMatchObject({ name: "Toko Maju", verified: true });
    expect(result.identity).toBeNull();
  });

  it("18. community reports: submit, approve, then counted in lookup", async () => {
    const created = await call("POST", "/api/v1/reports", { phone: PHONE_C, category: "spam", description: "Menelepon berulang kali menawarkan pinjaman." }, turnstile);
    expect(created.status).toBe(201);
    expect((await lookup(PHONE_C)).reportCount).toBe(0);
    const approved = await call("POST", `/api/admin/reports/${created.body.report.id}/moderate`, { action: "approved" }, admin);
    expect(approved.status).toBe(200);
    const result = await lookup(PHONE_C);
    expect(result.reportCount).toBe(1);
    expect(result.categories).toEqual([{ name: "spam", count: 1 }]);
    expect(result.identity).toBeNull();
  });
});
