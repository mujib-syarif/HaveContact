import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Check, X, ShieldOff } from "lucide-react";

type Claim = {
  id: string; display_name: string; public_profile_url: string; status: string; review_note: string | null;
  created_at: string; consent_at: string; reviewed_at: string | null; expires_at: string | null; withdrawn_at: string | null;
  phone_fingerprint: string; duplicate_count: number;
};
type Filter = "pending" | "approved" | "rejected" | "withdrawn" | "revoked" | "expired";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "pending", label: "Menunggu" }, { key: "approved", label: "Disetujui" }, { key: "rejected", label: "Ditolak" },
  { key: "withdrawn", label: "Ditarik" }, { key: "revoked", label: "Dicabut" }, { key: "expired", label: "Kedaluwarsa" }
];
const API = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");
const fmt = (value: string | null) => value ? new Date(value).toLocaleString() : "-";

export default function IdentityClaims({ token }: { token: string }) {
  const [filter, setFilter] = useState<Filter>("pending");
  const [claims, setClaims] = useState<Claim[]>([]);
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [seenPhone, setSeenPhone] = useState<Record<string, string>>({});
  const [confirmed, setConfirmed] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    if (!API || !token) return;
    setBusy(true);
    try {
      const r = await fetch(`${API}/api/admin/identity-claims?status=${filter}`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json() as { ok: boolean; claims?: Claim[]; error?: string };
      if (!r.ok || !d.ok) throw new Error(d.error ?? "Gagal memuat pengajuan.");
      setClaims(d.claims ?? []);
    } catch (e) { setMessage(e instanceof Error ? e.message : "Gagal memuat."); } finally { setBusy(false); }
  }, [token, filter]);
  useEffect(() => { void load(); }, [load]);

  async function act(id: string, kind: "approved" | "rejected" | "revoke") {
    setBusy(true); setMessage("");
    try {
      const path = kind === "revoke" ? "revoke" : "moderate";
      const body = kind === "approved"
        ? { action: "approved", note: notes[id] ?? "", phone: seenPhone[id] ?? "", evidenceConfirmed: confirmed[id] === true }
        : kind === "rejected" ? { action: "rejected", note: notes[id] ?? "" } : { note: notes[id] ?? "" };
      const r = await fetch(`${API}/api/admin/identity-claims/${id}/${path}`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
      const d = await r.json() as { ok: boolean; error?: string };
      if (!r.ok || !d.ok) throw new Error(d.error ?? "Moderasi gagal.");
      setClaims(old => old.filter(x => x.id !== id));
      setMessage(kind === "approved" ? "Identitas disetujui dan kini tampil di pencarian." : kind === "rejected" ? "Pengajuan ditolak." : "Identitas dicabut dari pencarian publik.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Moderasi gagal."); } finally { setBusy(false); }
  }

  return <section className="mt-10 border-t border-white/10 pt-7" aria-labelledby="identity-admin-title">
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="section-kicker">OPT-IN IDENTITY</p>
        <h2 id="identity-admin-title" className="mt-2 text-xl font-semibold">Pengajuan nama publik</h2>
        <p className="mt-1 text-xs text-hc-muted">Setujui hanya jika halaman bukti memuat nama dan nomor yang sama. Ini bukan verifikasi identitas resmi.</p>
      </div>
      <button onClick={() => void load()} disabled={busy} className="rounded-xl border border-white/15 bg-white/5 p-2.5 text-hc-muted" aria-label="Refresh identity claims"><RefreshCw size={16} /></button>
    </div>
    <div role="tablist" aria-label="Status pengajuan" className="mt-4 flex flex-wrap gap-2">
      {FILTERS.map(f => <button key={f.key} role="tab" aria-selected={filter === f.key} onClick={() => setFilter(f.key)} className={`rounded-full border px-3 py-1.5 text-xs ${filter === f.key ? "border-hc-lime/40 bg-hc-lime/10 text-hc-lime" : "border-white/10 text-hc-muted"}`}>{f.label}</button>)}
    </div>
    <div className="mt-4 space-y-3">
      {claims.length === 0
        ? <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-8 text-center text-sm text-hc-muted">{busy ? "Memuat..." : "Tidak ada pengajuan di daftar ini."}</div>
        : claims.map(item => <article key={item.id} className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold">{item.display_name}</p>
            {item.duplicate_count > 0 && <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-2.5 py-1 text-[10px] font-semibold text-amber-200">Nomor sama: {item.duplicate_count} klaim lain aktif</span>}
          </div>
          <a href={item.public_profile_url} target="_blank" rel="noreferrer noopener nofollow" className="mt-2 block break-all text-xs text-hc-lime underline">{item.public_profile_url}</a>
          <dl className="mt-2 grid gap-x-4 gap-y-1 text-[11px] text-hc-muted sm:grid-cols-2">
            <div>Fingerprint nomor: {item.phone_fingerprint}</div><div>Diajukan: {fmt(item.created_at)}</div>
            <div>Persetujuan publik: {fmt(item.consent_at)}</div><div>Ditinjau: {fmt(item.reviewed_at)}</div>
            {item.expires_at && <div>Kedaluwarsa: {fmt(item.expires_at)}</div>}{item.withdrawn_at && <div>Ditarik/dicabut: {fmt(item.withdrawn_at)}</div>}
          </dl>
          {item.review_note && <p className="mt-2 rounded-lg border border-white/10 bg-black/10 p-2 text-xs text-white/80">Catatan: {item.review_note}</p>}
          {item.status === "pending" && <div className="mt-3 grid gap-3">
            <label className="grid gap-2 text-xs text-hc-muted">Nomor yang tertera di halaman bukti
              <input value={seenPhone[item.id] ?? ""} onChange={e => setSeenPhone(o => ({ ...o, [item.id]: e.target.value }))} inputMode="tel" placeholder="+62 812..." className="glass-input" />
              <span className="font-normal">Harus cocok dengan nomor yang diajukan; dicek terhadap HMAC di server.</span>
            </label>
            <label className="grid gap-2 text-xs text-hc-muted">Catatan bukti / alasan penolakan
              <textarea value={notes[item.id] ?? ""} onChange={e => setNotes(o => ({ ...o, [item.id]: e.target.value }))} className="glass-input" rows={2} maxLength={500} placeholder="Setujui: jelaskan bukti (min. 10 karakter). Tolak: alasan (min. 5 karakter)." />
            </label>
            <label className="flex items-start gap-2 text-xs text-hc-muted"><input type="checkbox" className="mt-0.5" checked={confirmed[item.id] === true} onChange={e => setConfirmed(o => ({ ...o, [item.id]: e.target.checked }))} />Saya membuka halaman bukti dan melihat nama dan nomor ini bersama-sama.</label>
            <div className="flex flex-wrap gap-2">
              <button disabled={busy || !confirmed[item.id] || (notes[item.id] ?? "").trim().length < 10 || !(seenPhone[item.id] ?? "").trim()} onClick={() => void act(item.id, "approved")} className="inline-flex items-center gap-2 rounded-xl border border-hc-lime/30 bg-hc-lime/10 px-3 py-2 text-xs font-semibold text-hc-lime disabled:opacity-40"><Check size={14} /> Approve</button>
              <button disabled={busy || (notes[item.id] ?? "").trim().length < 5} onClick={() => void act(item.id, "rejected")} className="inline-flex items-center gap-2 rounded-xl border border-rose-300/20 bg-rose-300/5 px-3 py-2 text-xs font-semibold text-rose-200 disabled:opacity-40"><X size={14} /> Reject</button>
            </div>
          </div>}
          {item.status === "approved" && <div className="mt-3 grid gap-2">
            <label className="grid gap-2 text-xs text-hc-muted">Alasan pencabutan
              <textarea value={notes[item.id] ?? ""} onChange={e => setNotes(o => ({ ...o, [item.id]: e.target.value }))} className="glass-input" rows={2} maxLength={500} />
            </label>
            <button disabled={busy || (notes[item.id] ?? "").trim().length < 5} onClick={() => void act(item.id, "revoke")} className="inline-flex w-fit items-center gap-2 rounded-xl border border-rose-300/20 bg-rose-300/5 px-3 py-2 text-xs font-semibold text-rose-200 disabled:opacity-40"><ShieldOff size={14} /> Cabut dari pencarian</button>
          </div>}
        </article>)}
    </div>
    {message && <p role="status" className="mt-3 text-xs text-hc-muted">{message}</p>}
  </section>;
}
