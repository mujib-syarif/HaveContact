import { parsePhoneNumberFromString } from "libphonenumber-js/max";

interface Env {
  DB: D1Database;
  PHONE_HASH_SECRET: string;
  TURNSTILE_SECRET?: string;
  ADMIN_API_TOKEN?: string;
  ALLOWED_ORIGINS?: string;
  APP_ENV?: string;
}
type RateResult = { allowed: boolean; retryAfter: number };
function cors(request: Request, env: Env): Headers {
  const origin = request.headers.get("Origin") ?? "";
  const allowed = (env.ALLOWED_ORIGINS ?? "").split(",").map(v=>v.trim()).filter(Boolean);
  const h = new Headers({
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Turnstile-Token, Authorization",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Cache-Control": "no-store"
  });
  if (origin && allowed.includes(origin)) h.set("Access-Control-Allow-Origin", origin);
  return h;
}
function json(request: Request, env: Env, data: unknown, status=200, extra: Record<string,string>={}): Response {
  const h=cors(request,env);h.set("Content-Type","application/json; charset=utf-8");
  for(const [k,v] of Object.entries(extra))h.set(k,v);
  return new Response(JSON.stringify(data),{status,headers:h});
}
function normalizePhone(input: unknown): string | null {
  if(typeof input!=="string")return null;
  const parsed=parsePhoneNumberFromString(input.trim(),"ID");
  return parsed?.isValid()?parsed.number:null;
}
