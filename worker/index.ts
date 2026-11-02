interface Env {
  DB: D1Database;
  PHONE_HASH_SECRET: string;
  TURNSTILE_SECRET?: string;
  ADMIN_API_TOKEN?: string;
  APP_ENV?: string;
}
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Turnstile-Token, Authorization",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer"
};
function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders });
}
function normalizePhone(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const compact = input.trim().replace(/[\s().-]/g, "");
  if (!/^\+?[1-9]\d{6,14}$/.test(compact)) return null;
  return compact.startsWith("+") ? compact : `+${compact}`;
}
async function hashPhone(phone: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(phone));
  return [...new Uint8Array(signature)].map(v => v.toString(16).padStart(2, "0")).join("");
}
async function verifyTurnstile(token: string | null, secret?: string): Promise<boolean> {
  if (!secret) return false;
  if (!token) return false;
  const body = new FormData();
  body.set("secret", secret);
  body.set("response", token);
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
  if (!response.ok) return false;
  const result = await response.json() as { success?: boolean };
  return result.success === true;
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/api/health") {
      return json({ ok: true, service: "havecontact-api", environment: env.APP_ENV ?? "unknown" });
    }
    if (!env.DB || !env.PHONE_HASH_SECRET) return json({ ok: false, error: "Service is not configured" }, 503);
    // Admin moderation routes are protected by a server-side bearer token.
    if (url.pathname === "/api/admin/reports" && request.method === "GET") {
      const supplied = request.headers.get("Authorization") ?? "";
      if (!env.ADMIN_API_TOKEN || supplied !== `Bearer ${env.ADMIN_API_TOKEN}`) {
        return json({ ok: false, error: "Unauthorized" }, 401);
      }
      const status = url.searchParams.get("status") ?? "pending";
      if (!["pending", "approved", "rejected"].includes(status)) return json({ ok: false, error: "Invalid status" }, 400);
      const rows = await env.DB.prepare("SELECT id, category, description, status, created_at FROM reports WHERE status = ? ORDER BY created_at ASC LIMIT 100").bind(status).all();
      return json({ ok: true, reports: rows.results ?? [] });
    }
    const moderationParts = url.pathname.split("/");
    const moderationId = moderationParts.length === 6 && moderationParts[1] === "api" && moderationParts[2] === "admin" && moderationParts[3] === "reports" && moderationParts[5] === "moderate" ? moderationParts[4] : "";
    if (request.method === "POST" && moderationId) {
      const supplied = request.headers.get("Authorization") ?? "";
      if (!env.ADMIN_API_TOKEN || supplied !== `Bearer ${env.ADMIN_API_TOKEN}`) return json({ ok: false, error: "Unauthorized" }, 401);
      let body: { action?: string };
      try { body = await request.json() as { action?: string }; } catch { return json({ ok: false, error: "Invalid JSON body" }, 400); }
      if (body.action !== "approved" && body.action !== "rejected") return json({ ok: false, error: "Invalid action" }, 400);
      const id = moderationId;
      const row = await env.DB.prepare("SELECT id, status FROM reports WHERE id = ?").bind(id).first<{ id: string; status: string }>();
      if (!row) return json({ ok: false, error: "Report not found" }, 404);
      if (row.status !== "pending") return json({ ok: false, error: "Report is no longer pending" }, 409);
      await env.DB.batch([
        env.DB.prepare("UPDATE reports SET status = ?, moderated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND status = 'pending'").bind(body.action, id),
        env.DB.prepare("INSERT INTO moderation_logs (id, report_id, action, moderator_ref) VALUES (?, ?, ?, 'admin-api')").bind(crypto.randomUUID(), id, body.action)
      ]);
      return json({ ok: true, report: { id, status: body.action } });
    }


    if (request.method === "GET" && url.pathname === "/api/v1/lookup") {
      const phone = normalizePhone(url.searchParams.get("phone"));
      if (!phone) return json({ ok: false, error: "Invalid phone number" }, 400);
      const phoneHash = await hashPhone(phone, env.PHONE_HASH_SECRET);
      const row = await env.DB.prepare(
        "SELECT category, COUNT(*) AS total FROM reports WHERE phone_hash = ? AND status = 'approved' GROUP BY category"
      ).bind(phoneHash).all<{ category: string; total: number }>();
      const reports = row.results ?? [];
      return json({
        ok: true,
        result: {
          number: phone,
          status: reports.length ? "reported" : "no_community_reports",
          reportCount: reports.reduce((sum, item) => sum + item.total, 0),
          categories: reports.map(item => ({ name: item.category, count: item.total })),
          identity: null,
          disclaimer: "Community reports are not proof of identity or wrongdoing."
        }
      });
    }

    if (request.method === "POST" && url.pathname === "/api/v1/reports") {
      const token = request.headers.get("X-Turnstile-Token");
      if (!(await verifyTurnstile(token, env.TURNSTILE_SECRET))) {
        return json({ ok: false, error: "Bot verification failed or is not configured" }, 403);
      }
      let body: Record<string, unknown>;
      try { body = await request.json() as Record<string, unknown>; }
      catch { return json({ ok: false, error: "Invalid JSON body" }, 400); }
      const phone = normalizePhone(body.phone);
      const category = body.category;
      const description = typeof body.description === "string" ? body.description.trim() : "";
      const allowed = ["spam","scam","telemarketing","business","other"];
      if (!phone || typeof category !== "string" || !allowed.includes(category)) {
        return json({ ok: false, error: "Invalid phone number or category" }, 400);
      }
      if (description.length < 10 || description.length > 500) {
        return json({ ok: false, error: "Description must be 10-500 characters" }, 400);
      }
      const phoneHash = await hashPhone(phone, env.PHONE_HASH_SECRET);
      const id = crypto.randomUUID();
      await env.DB.prepare("INSERT OR IGNORE INTO phone_index (phone_hash) VALUES (?)").bind(phoneHash).run();
      await env.DB.prepare(
        "INSERT INTO reports (id, phone_hash, category, description, status) VALUES (?, ?, ?, ?, 'pending')"
      ).bind(id, phoneHash, category, description).run();
      return json({ ok: true, report: { id, status: "pending" }, message: "Report submitted for moderation." }, 201);
    }
    return json({ ok: false, error: "Not found" }, 404);
  }
};