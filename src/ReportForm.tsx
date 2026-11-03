import { useEffect, useRef, useState, type FormEvent } from "react";
import { Send, Copy, Check } from "lucide-react";
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



export default function ReportForm() {
  const [phone, setPhone] = useState("");
  const [category, setCategory] = useState("spam");
  const [description, setDescription] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [receiptId, setReceiptId] = useState("");
  const [copied, setCopied] = useState(false);
  const captcha = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!SITE_KEY || !captcha.current) return;
    let cancelled = false;
    const render = () => {
      if (!cancelled && window.turnstile && captcha.current) {
        widgetId.current = window.turnstile.render(captcha.current, {
          sitekey: SITE_KEY,
          callback: setToken,
          "expired-callback": () => setToken("")
        });
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
    return () => {
      cancelled = true;
      if (widgetId.current) window.turnstile?.remove(widgetId.current);
      widgetId.current = undefined;
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const normalized = normalizePhone(phone);
    if (!API) return setMessage("API belum dikonfigurasi.");
    if (!normalized) return setMessage("Nomor telepon tidak valid.");
    if (!token) return setMessage("Selesaikan verifikasi keamanan terlebih dahulu.");
    setBusy(true);
    try {
      const response = await fetch(`${API}/api/v1/reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Turnstile-Token": token },
        body: JSON.stringify({ phone: normalized, category, description })
      });
      const data = await response.json() as { ok: boolean; error?: string; report?: { id?: string; status?: string } };
      if (!response.ok || !data.ok) throw new Error(data.error ?? "Pengiriman gagal.");
      setMessage("Laporan diterima dan menunggu moderasi. Simpan ID referensi ini untuk keperluan tindak lanjut.");
      setReceiptId(data.report?.id ?? "");
      setCopied(false);
      setPhone(""); setDescription(""); setToken("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Terjadi kesalahan jaringan.");
    } finally {
      setBusy(false);
      setToken("");
      if (widgetId.current) window.turnstile?.reset(widgetId.current);
    }
  }

  return <form onSubmit={submit} className="glass grid gap-4 rounded-3xl p-5 sm:p-8">
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="grid gap-2 text-xs text-hc-muted">Nomor telepon
        <input required value={phone} onChange={e => setPhone(e.target.value)} placeholder="+62 812..." inputMode="tel" className="rounded-xl border border-hc-line bg-black/20 px-4 py-3 text-sm text-white"/>
      </label>
      <label className="grid gap-2 text-xs text-hc-muted">Kategori
        <select value={category} onChange={e => setCategory(e.target.value)} className="rounded-xl border border-hc-line bg-[#181b17] px-4 py-3 text-sm text-white">
          <option value="spam">Spam</option><option value="scam">Dugaan penipuan</option><option value="telemarketing">Telemarketing</option><option value="business">Layanan bisnis</option><option value="other">Lainnya</option>
        </select>
      </label>
    </div>
    <label className="grid gap-2 text-xs text-hc-muted">Pengalaman faktual (10-500 karakter)
      <textarea required minLength={10} maxLength={500} value={description} onChange={e => setDescription(e.target.value)} rows={4} placeholder="Ceritakan pengalaman tanpa menyebut identitas pribadi." className="rounded-xl border border-hc-line bg-black/20 px-4 py-3 text-sm text-white"/>
    </label>
    <p className="text-xs text-hc-muted">Jangan sertakan nama, alamat, nomor identitas, data keuangan, atau informasi pribadi siapa pun.</p>
    {SITE_KEY ? <div ref={captcha}/> : <p className="text-xs text-amber-200">Tambahkan VITE_TURNSTILE_SITE_KEY untuk mengaktifkan verifikasi.</p>}
    <div className="flex flex-wrap items-center justify-between gap-3">
      <button disabled={busy || !SITE_KEY} className="search-button" type="submit">{busy ? "Mengirim..." : "Kirim laporan"} <Send size={15}/></button>
      <span className="text-xs text-hc-muted">Nomor diindeks dengan HMAC.</span>
    </div>
    {message && <div role="status" className="grid gap-3 rounded-xl border border-hc-line p-3 text-xs text-hc-muted"><p>{message}</p>{receiptId && <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-black/20 p-3"><div className="min-w-0"><p className="text-[10px] uppercase tracking-wide text-hc-muted">Report reference</p><p className="mt-1 break-all font-mono text-xs text-white">{receiptId}</p></div><button type="button" onClick={() => { void navigator.clipboard.writeText(receiptId).then(() => setCopied(true)).catch(() => setCopied(false)); }} className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-xs text-white">{copied ? <Check size={13}/> : <Copy size={13}/>} {copied ? "Tersalin" : "Salin ID"}</button></div>}</div>}
  </form>;
}