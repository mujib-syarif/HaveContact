import { useEffect, useRef, useState, type FormEvent } from "react";
import { normalizePhone } from "../shared/phone";

declare global {
  interface Window {
    turnstile?: {
      render: (node: HTMLElement, options: { sitekey: string; callback: (token: string) => void; "expired-callback"?: () => void }) => string;
      remove: (id: string) => void;
      reset: (id?: string) => void;
    };
  }
}
const API = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");
const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY ?? "";
const STATUS_LABEL: Record<string, string> = {
  pending: "Menunggu peninjauan moderator",
  approved: "Disetujui dan tampil di pencarian",
  rejected: "Ditolak",
  withdrawn: "Ditarik oleh Anda",
  revoked: "Dicabut oleh moderator",
  expired: "Kedaluwarsa, tidak lagi tampil"
};

type Api = { ok: boolean; error?: string; message?: string; withdrawalToken?: string; claim?: { status: string; submittedAt?: string; expiresAt?: string | null } };
async function post(path: string, body: unknown, headers: Record<string, string> = {}): Promise<Api> {
  const response = await fetch(`${API}${path}`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
  const data = await response.json() as Api;
  if (!response.ok || !data.ok) throw new Error(data.error ?? "Permintaan gagal.");
  return data;
}

export default function IdentityClaimForm() {
  const [phone, setPhone] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [profileUrl, setProfileUrl] = useState("");
  const [consent, setConsent] = useState(false);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [issuedCode, setIssuedCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [code, setCode] = useState("");
  const [manageMessage, setManageMessage] = useState("");
  const captcha = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!SITE_KEY || !captcha.current) return;
    let cancelled = false;
    const render = () => {
      if (!cancelled && window.turnstile && captcha.current) {
        widgetId.current = window.turnstile.render(captcha.current, { sitekey: SITE_KEY, callback: setToken, "expired-callback": () => setToken("") });
      }
    };
    if (window.turnstile) render();
    else {
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.onload = render;
      document.head.appendChild(script);
    }
    return () => { cancelled = true; if (widgetId.current) window.turnstile?.remove(widgetId.current); };
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setMessage(""); setFailed(true); setIssuedCode(""); setCopied(false);
    const normalized = normalizePhone(phone);
    if (!API) return setMessage("API belum dikonfigurasi.");
    if (!normalized) return setMessage("Nomor telepon tidak valid. Gunakan format internasional, contoh +62 812...");
    if (!consent) return setMessage("Persetujuan publik wajib diberikan.");
    if (!/^https:\/\//i.test(profileUrl.trim())) return setMessage("URL bukti harus diawali https://");
    if (!token) return setMessage("Selesaikan verifikasi keamanan terlebih dahulu.");
    setBusy(true);
    try {
      const data = await post("/api/v1/identity-claims", { phone: normalized, displayName, publicProfileUrl: profileUrl, consentPublic: consent }, { "X-Turnstile-Token": token });
      setFailed(false);
      setMessage(data.message ?? "Pengajuan diterima.");
      setIssuedCode(data.withdrawalToken ?? "");
      setPhone(""); setDisplayName(""); setProfileUrl(""); setConsent(false);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Terjadi kesalahan jaringan.");
    } finally {
      setBusy(false); setToken("");
      if (widgetId.current) window.turnstile?.reset(widgetId.current);
    }
  }

  async function manage(action: "status" | "withdraw") {
    setManageMessage("");
    if (!code.trim()) return setManageMessage("Masukkan kode penarikan Anda.");
    setBusy(true);
    try {
      const data = await post(`/api/v1/identity-claims/${action}`, { withdrawalToken: code.trim() });
      if (action === "withdraw") setManageMessage(data.message ?? "Identitas ditarik.");
      else setManageMessage(`Status: ${STATUS_LABEL[data.claim?.status ?? ""] ?? data.claim?.status}`);
    } catch (err) {
      setManageMessage(err instanceof Error ? err.message : "Terjadi kesalahan jaringan.");
    } finally { setBusy(false); }
  }

  async function copyCode() {
    try { await navigator.clipboard.writeText(issuedCode); setCopied(true); } catch { setCopied(false); }
  }

  return <div className="grid gap-4">
    <form onSubmit={submit} className="glass grid gap-4 rounded-3xl p-5 sm:p-8" aria-describedby="identity-privacy">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-xs text-hc-muted">Nomor milik Anda
          <input required value={phone} onChange={e => setPhone(e.target.value)} placeholder="+62 812..." inputMode="tel" autoComplete="tel" className="glass-input" />
        </label>
        <label className="grid gap-2 text-xs text-hc-muted">Nama tampilan publik
          <input required minLength={2} maxLength={80} value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Nama yang ingin ditampilkan" autoComplete="name" className="glass-input" />
        </label>
      </div>
      <label className="grid gap-2 text-xs text-hc-muted">URL bukti publik (HTTPS) yang mencantumkan nama dan nomor Anda
        <input required type="url" value={profileUrl} onChange={e => setProfileUrl(e.target.value)} placeholder="https://profil-anda.id/kontak" className="glass-input" />
      </label>
      <div id="identity-privacy" className="rounded-xl border border-hc-line p-3 text-xs leading-5 text-hc-muted">
        <p className="font-semibold text-white/90">Yang perlu Anda ketahui</p>
        <ul className="mt-1 list-disc space-y-1 pl-4">
          <li>Hanya daftarkan nomor Anda sendiri. Tidak ada tampilan otomatis: moderator harus melihat halaman publik yang benar-benar memuat nama dan nomor yang sama.</li>
          <li>Jika disetujui, nama dan tautan bukti tampil di hasil pencarian nomor ini selama 365 hari, lalu kedaluwarsa.</li>
          <li>Anda dapat menarik kapan saja dengan kode penarikan yang diberikan setelah pengiriman. Kami tidak menyimpan nomor mentah, hanya indeks HMAC.</li>
          <li>Persetujuan platform bukan verifikasi identitas resmi pemerintah.</li>
        </ul>
      </div>
      <label className="flex items-start gap-3 text-xs leading-5 text-hc-muted">
        <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} className="mt-1 h-4 w-4" />
        <span>Saya pemilik/pengguna sah nomor ini dan secara sadar mengizinkan nama tampilan serta tautan bukti saya muncul di hasil pencarian publik HaveContact setelah peninjauan.</span>
      </label>
      {SITE_KEY ? <div ref={captcha} /> : <p className="text-xs text-amber-200">Turnstile belum dikonfigurasi.</p>}
      <button disabled={busy || !SITE_KEY || !consent} className="search-button w-fit" type="submit">{busy ? "Mengirim..." : "Ajukan nama publik"}</button>
      {message && <p role={failed ? "alert" : "status"} className={`rounded-xl border p-3 text-xs ${failed ? "border-amber-300/30 text-amber-200" : "border-hc-lime/30 text-hc-lime"}`}>{message}</p>}
      {issuedCode && <div className="rounded-xl border border-hc-lime/30 bg-hc-lime/5 p-3 text-xs text-white/90">
        <p className="font-semibold">Kode penarikan Anda (hanya ditampilkan sekali)</p>
        <p className="mt-2 break-all rounded-lg bg-black/30 p-2 font-mono text-[11px]">{issuedCode}</p>
        <button type="button" onClick={() => void copyCode()} className="mt-2 rounded-lg border border-white/15 px-3 py-1.5 text-xs">{copied ? "Tersalin" : "Salin kode"}</button>
        <p className="mt-2 text-hc-muted">Simpan kode ini. Tanpa kode, penarikan hanya dapat dilakukan lewat permintaan koreksi ke moderator.</p>
      </div>}
    </form>

    <div className="glass grid gap-3 rounded-3xl p-5 sm:p-6">
      <p className="text-sm font-semibold">Sudah mendaftar? Cek status atau tarik identitas</p>
      <label className="grid gap-2 text-xs text-hc-muted">Kode penarikan
        <input value={code} onChange={e => setCode(e.target.value)} autoComplete="off" spellCheck={false} placeholder="Tempel kode penarikan" className="glass-input font-mono" />
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => void manage("status")} className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold">Cek status</button>
        <button type="button" disabled={busy} onClick={() => void manage("withdraw")} className="rounded-xl border border-rose-300/20 bg-rose-300/5 px-4 py-2 text-xs font-semibold text-rose-200">Tarik identitas saya</button>
      </div>
      {manageMessage && <p role="status" className="text-xs text-hc-muted">{manageMessage}</p>}
    </div>
  </div>;
}
