import { useState, type FormEvent } from "react";
import { Trash2, ShieldCheck } from "lucide-react";

const API = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

export default function RemovalForm() {
  const [referenceId, setReferenceId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [done, setDone] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setDone(false);
    if (!API) return setMessage("API belum dikonfigurasi.");
    setBusy(true);
    try {
      const response = await fetch(`${API}/api/v1/reports/remove`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ referenceId: referenceId.trim() })
      });
      const data = await response.json() as { ok: boolean; error?: string; message?: string };
      if (!response.ok || !data.ok) throw new Error(data.error ?? "Permintaan penghapusan gagal.");
      setDone(true);
      setMessage("Laporan dan riwayat moderasinya berhasil dihapus.");
      setReferenceId("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Terjadi kesalahan jaringan.");
    } finally {
      setBusy(false);
    }
  }

  return <form onSubmit={submit} className="glass grid gap-4 rounded-3xl p-5 sm:p-7">
    <div className="flex items-start gap-3"><span className="rounded-xl border border-white/10 bg-white/5 p-2.5 text-hc-lime"><ShieldCheck size={18}/></span><div><h3 className="text-sm font-semibold">Kelola laporanmu</h3><p className="mt-1 text-xs leading-5 text-hc-muted">Masukkan Report Reference ID untuk menghapus laporan yang pernah kamu kirim, termasuk jika sudah disetujui.</p></div></div>
    <label className="grid gap-2 text-xs text-hc-muted">Report Reference ID<input required value={referenceId} onChange={event => setReferenceId(event.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" autoComplete="off" spellCheck={false} className="glass-input font-mono"/></label>
    <p className="text-xs leading-5 text-hc-muted">ID ini berfungsi sebagai kunci akses laporan. Siapa pun yang memilikinya dapat menghapus laporan tersebut. Simpan secara pribadi dan jangan bagikan.</p>
    <div className="flex flex-wrap items-center justify-between gap-3"><button type="submit" disabled={busy || !referenceId.trim()} className="inline-flex items-center gap-2 rounded-xl border border-rose-300/20 bg-rose-300/5 px-4 py-3 text-xs font-semibold text-rose-200 disabled:opacity-50"><Trash2 size={14}/>{busy ? "Menghapus..." : "Hapus laporan"}</button><span className="text-[11px] text-hc-muted">Maksimal 3 percobaan per jam</span></div>
    {message && <p role="status" className={done ? "rounded-xl border border-hc-lime/20 bg-hc-lime/5 p-3 text-xs text-hc-lime" : "rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-hc-muted"}>{message}</p>}
  </form>;
}
