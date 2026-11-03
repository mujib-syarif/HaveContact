import { normalizePhone } from "../shared/phone";
import { hasUnsupportedControlCharacters } from "./validation";

export const IDENTITY_STATUSES = ["pending", "approved", "rejected", "withdrawn", "revoked"] as const;
export type IdentityStatus = (typeof IDENTITY_STATUSES)[number];
export const IDENTITY_LIST_FILTERS = [...IDENTITY_STATUSES, "expired"] as const;
export const IDENTITY_APPROVAL_DAYS = 365;

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";

export type IdentitySubmission = { phone: string; displayName: string; proofUrl: string };
export type Validation<T> = { ok: true; value: T } | { ok: false; error: string };

/** A proof URL must be a plain public HTTPS page: no credentials, no IP literal, no local hosts. */
export function normalizeProofUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (value.length < 12 || value.length > 500 || hasUnsupportedControlCharacters(value) || /\s/.test(value)) return null;
  let url: URL;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase();
  if (!host.includes(".") || host.endsWith(".") || /^\[/.test(host) || /^\d+(\.\d+){3}$/.test(host)) return null;
  if (host === "localhost" || /\.(local|localhost|internal|lan|home|test|invalid|example)$/.test(host)) return null;
  url.hash = "";
  return url.toString();
}

export function validateIdentitySubmission(body: Record<string, unknown>): Validation<IdentitySubmission> {
  if (body.consentPublic !== true) return { ok: false, error: "Persetujuan publik wajib diberikan secara eksplisit." };
  const phone = normalizePhone(body.phone);
  if (!phone) return { ok: false, error: "Nomor telepon tidak valid." };
  const displayName = typeof body.displayName === "string" ? body.displayName.trim().replace(/\s+/g, " ") : "";
  if (displayName.length < 2 || displayName.length > 80 || hasUnsupportedControlCharacters(displayName) || /https?:\/\/|www\./i.test(displayName) || /\d{6,}/.test(displayName.replace(/[\s().-]/g, ""))) {
    return { ok: false, error: "Nama tampilan harus 2-80 karakter dan tidak boleh berisi URL atau nomor telepon." };
  }
  const proofUrl = normalizeProofUrl(body.publicProfileUrl);
  if (!proofUrl) return { ok: false, error: "URL bukti harus berupa halaman HTTPS publik yang valid." };
  return { ok: true, value: { phone, displayName, proofUrl } };
}

export function isUniqueConstraintError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return message.includes("unique") || message.includes("constraint");
}

export function createWithdrawalToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function isWithdrawalTokenShape(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
}

export type PublicIdentity = {
  name: string;
  proofUrl: string;
  verified: true;
  verificationType: "opt-in-public-identity";
  approvedAt: string;
};

/**
 * Only an approved, consented, non-expired claim is public. Nothing else
 * (hash, id, notes, status, evidence) is selected, so nothing else can leak.
 */
export async function findPublicIdentity(db: D1Database, phoneHash: string): Promise<PublicIdentity | null> {
  const rows = await db.prepare(
    `SELECT display_name,public_profile_url,reviewed_at FROM identity_claims
     WHERE phone_hash=? AND status='approved' AND consent_public=1 AND withdrawn_at IS NULL
       AND expires_at IS NOT NULL AND expires_at > ${NOW}
     ORDER BY reviewed_at DESC LIMIT 1`
  ).bind(phoneHash).all<{ display_name: string; public_profile_url: string; reviewed_at: string }>();
  const row = rows.results?.[0];
  if (!row) return null;
  return {
    name: row.display_name,
    proofUrl: row.public_profile_url,
    verified: true,
    verificationType: "opt-in-public-identity",
    approvedAt: row.reviewed_at
  };
}

export async function findActiveClaim(db: D1Database, phoneHash: string): Promise<{ status: string } | null> {
  const row = await db.prepare(
    `SELECT status FROM identity_claims WHERE phone_hash=?
     AND (status='pending' OR (status='approved' AND expires_at > ${NOW})) LIMIT 1`
  ).bind(phoneHash).first<{ status: string }>();
  return row ?? null;
}

export async function insertPendingClaim(
  db: D1Database,
  input: { id: string; phoneHash: string; displayName: string; proofUrl: string; tokenHash: string }
): Promise<void> {
  await db.prepare(
    `INSERT INTO identity_claims (id,phone_hash,display_name,public_profile_url,consent_public,consent_at,withdrawal_token_hash)
     VALUES (?,?,?,?,1,${NOW},?)`
  ).bind(input.id, input.phoneHash, input.displayName, input.proofUrl, input.tokenHash).run();
}

export async function getClaimStatusByToken(
  db: D1Database,
  tokenHash: string
): Promise<{ status: string; created_at: string; reviewed_at: string | null; expires_at: string | null } | null> {
  const row = await db.prepare(
    "SELECT status,created_at,reviewed_at,expires_at FROM identity_claims WHERE withdrawal_token_hash=? ORDER BY created_at DESC LIMIT 1"
  ).bind(tokenHash).first<{ status: string; created_at: string; reviewed_at: string | null; expires_at: string | null }>();
  return row ?? null;
}

/** Owner withdrawal: works for pending and approved claims, idempotent otherwise. */
export async function withdrawClaimByToken(db: D1Database, tokenHash: string): Promise<boolean> {
  const result = await db.prepare(
    `UPDATE identity_claims SET status='withdrawn',withdrawn_at=${NOW} WHERE withdrawal_token_hash=? AND status IN ('pending','approved')`
  ).bind(tokenHash).run();
  return (result.meta?.changes ?? 0) >= 1;
}

export type AdminIdentityClaim = {
  id: string;
  display_name: string;
  public_profile_url: string;
  status: string;
  review_note: string | null;
  created_at: string;
  consent_at: string;
  reviewed_at: string | null;
  expires_at: string | null;
  withdrawn_at: string | null;
  phone_fingerprint: string;
  duplicate_count: number;
};

export async function listClaimsForAdmin(db: D1Database, filter: string): Promise<AdminIdentityClaim[]> {
  const where = filter === "expired" ? "c.status='approved' AND c.expires_at <= " + NOW : "c.status=? AND NOT (c.status='approved' AND c.expires_at <= " + NOW + ")";
  const statement = db.prepare(
    `SELECT c.id,c.display_name,c.public_profile_url,c.status,c.review_note,c.created_at,c.consent_at,c.reviewed_at,c.expires_at,c.withdrawn_at,
       substr(c.phone_hash,1,12) AS phone_fingerprint,
       (SELECT COUNT(*) FROM identity_claims d WHERE d.phone_hash=c.phone_hash AND d.id<>c.id AND d.status IN ('pending','approved')) AS duplicate_count
     FROM identity_claims c WHERE ${where} ORDER BY c.created_at ASC LIMIT 100`
  );
  const rows = await (filter === "expired" ? statement.all<AdminIdentityClaim>() : statement.bind(filter).all<AdminIdentityClaim>());
  return rows.results ?? [];
}

export async function getPendingClaimHash(db: D1Database, id: string): Promise<string | null> {
  const row = await db.prepare("SELECT phone_hash FROM identity_claims WHERE id=? AND status='pending'").bind(id).first<{ phone_hash: string }>();
  return row?.phone_hash ?? null;
}

export async function approveClaim(db: D1Database, id: string, note: string): Promise<boolean> {
  // One transaction: retire an expired approval for the same number (it still occupies the
  // unique "one approved per phone" slot), then approve the pending claim.
  const results = await db.batch([
    db.prepare(
      `UPDATE identity_claims SET status='revoked',review_note='Expired and superseded by a new approval'
       WHERE status='approved' AND expires_at <= ${NOW}
         AND phone_hash=(SELECT phone_hash FROM identity_claims WHERE id=? AND status='pending')`
    ).bind(id),
    db.prepare(
      `UPDATE identity_claims SET status='approved',review_note=?,reviewed_at=${NOW},expires_at=strftime('%Y-%m-%dT%H:%M:%fZ','now','+${IDENTITY_APPROVAL_DAYS} days')
       WHERE id=? AND status='pending'`
    ).bind(note, id)
  ]);
  return (results[1]?.meta?.changes ?? 0) === 1;
}

export async function rejectClaim(db: D1Database, id: string, note: string): Promise<boolean> {
  const result = await db.prepare(
    `UPDATE identity_claims SET status='rejected',review_note=?,reviewed_at=${NOW} WHERE id=? AND status='pending'`
  ).bind(note, id).run();
  return (result.meta?.changes ?? 0) === 1;
}

export async function revokeClaim(db: D1Database, id: string, note: string): Promise<boolean> {
  const result = await db.prepare(
    `UPDATE identity_claims SET status='revoked',review_note=?,withdrawn_at=${NOW} WHERE id=? AND status='approved'`
  ).bind(note, id).run();
  return (result.meta?.changes ?? 0) === 1;
}
