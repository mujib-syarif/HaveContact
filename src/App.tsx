import { useState, type FormEvent, type ReactNode } from "react";
import ReportForm from "./ReportForm";
import RemovalForm from "./RemovalForm";
import FeedbackForm from "./FeedbackForm";
import AdminPanel from "./AdminPanel";
import { normalizePhone } from "../shared/phone";
import { Search, ShieldCheck, Phone, Flag, Users, ArrowUpRight, Menu, X, Globe2, LockKeyhole } from "lucide-react";

type LookupResult = {
  number: string;
  status: "reported" | "no_community_reports";
  reportCount: number;
  categories: { name: string; count: number }[];
  identity: null;
  labels: { label: string; mentions: number; source: string; verified: boolean }[];
  metadata: { country: string | null; countryCallingCode: string; nationalNumber: string; numberType: string | null; valid: boolean } | null;
  disclaimer: string;
};
const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");


function App() {
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<LookupResult | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = normalizePhone(phone);
    setError("");
    setResult(null);
    if (!normalized) { setError("Masukkan nomor valid dengan 7-15 digit."); return; }
    setPhone(normalized);
    if (!API_BASE) {
      setError("API belum dikonfigurasi. Backend akan tersedia setelah deployment Cloudflare.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`${API_BASE}/api/v1/lookup?phone=${encodeURIComponent(normalized)}`);
      const payload = await response.json() as { ok: boolean; result?: LookupResult; error?: string };
      if (!response.ok || !payload.ok || !payload.result) throw new Error(payload.error ?? "Pencarian gagal.");
      setResult(payload.result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan jaringan.");
    } finally { setBusy(false); }
  }

  if (window.location.pathname === "/admin") return <AdminPanel/>;

  return <main className="min-h-screen overflow-hidden bg-hc-bg text-white">
    <div className="ambient ambient-one" /><div className="ambient ambient-two" />
    <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
      <a href="#" className="flex items-center gap-3" aria-label="HaveContact home">
        <span className="brand-mark"><Phone size={19} strokeWidth={2.5} /></span>
        <span className="text-lg font-bold tracking-tight">HaveContact<span className="text-hc-lime">.</span></span>
      </a>
      <nav className="hidden items-center gap-8 text-sm text-hc-muted md:flex">
        <a className="nav-link" href="#how-it-works">Cara kerja</a><a className="nav-link" href="#community">Komunitas</a><a className="nav-link" href="#privacy">Privasi</a>
      </nav>
      <span className="hidden rounded-full border border-hc-line px-3 py-1.5 text-xs text-hc-muted md:inline-flex">BETA</span>
      <button className="rounded-xl border border-hc-line p-2 text-hc-muted md:hidden" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle menu">{menuOpen ? <X size={19}/> : <Menu size={19}/>}</button>
    </header>
    {menuOpen && <nav className="glass relative z-20 mx-5 flex flex-col gap-4 rounded-2xl p-5 text-sm text-hc-muted md:hidden"><a href="#how-it-works" onClick={() => setMenuOpen(false)}>Cara kerja</a><a href="#community" onClick={() => setMenuOpen(false)}>Komunitas</a><a href="#privacy" onClick={() => setMenuOpen(false)}>Privasi</a></nav>}

    <section className="relative z-10 mx-auto flex max-w-4xl flex-col items-center px-5 pb-20 pt-16 text-center sm:px-8 sm:pt-24">
      <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-hc-line bg-white/[0.03] px-3.5 py-2 text-[11px] font-semibold tracking-[0.16em] text-hc-lime"><span className="h-1.5 w-1.5 rounded-full bg-hc-lime shadow-[0_0_12px_#c4f36b]"/>COMMUNITY PHONE INTELLIGENCE</div>
      <h1 className="max-w-3xl text-4xl font-semibold leading-[1.08] tracking-[-0.055em] sm:text-6xl">Kenali nomornya.<br/><span className="text-hc-lime">Pahami risikonya.</span></h1>
      <p className="mt-6 max-w-xl text-sm leading-7 text-hc-muted sm:text-base">Cari label bisnis, kategori komunitas, dan reputasi nomor telepon. Lebih waspada, tanpa mengorbankan privasi.</p>
      <form onSubmit={handleSearch} className="search-shell mt-10 w-full max-w-2xl text-left">
        <div className="flex items-center gap-3 px-4 py-3 sm:px-5"><Search className="shrink-0 text-hc-lime" size={21}/><label className="sr-only" htmlFor="phone-search">Nomor telepon</label><input id="phone-search" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="Masukkan nomor, contoh +62 812..." inputMode="tel" autoComplete="tel" className="min-w-0 flex-1 bg-transparent py-2 text-sm text-white outline-none placeholder:text-[#697064] sm:text-base"/><button type="submit" disabled={busy} className="search-button">{busy ? "Mencari..." : "Cari"} <ArrowUpRight size={16}/></button></div>
        {error && <p role="alert" className="border-t border-hc-line px-5 py-3 text-xs text-amber-200">{error}</p>}
      </form>
      {result && <div className="result-card mt-5 w-full max-w-2xl text-left">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs text-hc-muted">Hasil pencarian</p><p className="mt-1 text-lg font-semibold">{result.number}</p></div><span className={result.reportCount ? "risk-pill" : "neutral-pill"}>{result.reportCount ? "Ada laporan komunitas" : "Belum ada laporan"}</span></div>
        {result.labels?.length > 0 && <div className="mini-stat mt-4"><p className="text-xs text-hc-muted">Nama bisnis / label komunitas</p><div className="mt-2 flex flex-wrap gap-2">{result.labels.map((item,index)=><span key={`${item.label}-${index}`} className="rounded-full border border-hc-lime/25 bg-hc-lime/10 px-3 py-1.5 text-xs text-hc-lime">{item.label}<span className="ml-2 text-hc-muted">{item.mentions} kontribusi</span></span>)}</div><p className="mt-2 text-[10px] text-hc-muted">Label komunitas dimoderasi, bukan identitas pemilik yang terverifikasi.</p></div>}
        <div className="mt-5 grid grid-cols-2 gap-3"><div className="mini-stat"><p className="text-2xl font-semibold">{result.reportCount}</p><p className="text-xs text-hc-muted">Laporan disetujui</p></div><div className="mini-stat"><p className="text-sm font-semibold">{result.categories.length ? result.categories.map(c=>c.name).join(", ") : "Belum tersedia"}</p><p className="text-xs text-hc-muted">Kategori laporan</p></div></div>
        {result.metadata && <div className="mini-stat mt-3"><p className="text-xs text-hc-muted">Metadata nomor</p><p className="mt-1 text-sm font-semibold">{result.metadata.country ?? "Wilayah tidak diketahui"} <span className="text-hc-muted">(+{result.metadata.countryCallingCode})</span></p><p className="mt-1 text-xs text-hc-muted">Jenis: {result.metadata.numberType ?? "Tidak teridentifikasi"}</p></div>}
        <p className="mt-4 text-xs leading-5 text-hc-muted">{result.disclaimer}</p>
      </div>}
      <div className="mt-4 flex items-center gap-2 text-xs text-hc-muted"><LockKeyhole size={13}/>Pencarian tidak otomatis menjadi laporan publik.</div>
      <div className="mt-16 grid w-full max-w-2xl grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat icon={<Search size={19}/>} title="Pencarian nomor" text="Lookup yang mudah"/><Stat icon={<ShieldCheck size={19}/>} title="Laporan komunitas" text="Informasi berbasis bukti"/><Stat icon={<LockKeyhole size={19}/>} title="Privasi utama" text="Data seperlunya"/>
      </div>
    </section>
    <section id="how-it-works" className="relative z-10 border-y border-hc-line/70 bg-white/[0.015]"><div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 sm:px-8 md:grid-cols-2 md:items-center"><div><p className="section-kicker">HOW IT WORKS</p><h2 className="mt-4 text-3xl font-semibold tracking-tight">Informasi yang berguna.<br/><span className="text-hc-lime">Bukan asumsi.</span></h2><p className="mt-4 max-w-lg text-sm leading-7 text-hc-muted">HaveContact menggabungkan metadata nomor yang tersedia secara sah dengan laporan komunitas yang melewati moderasi.</p></div><div className="space-y-3"><InfoRow icon={<Globe2 size={18}/>} title="Metadata nomor" text="Negara dan informasi numbering plan jika tersedia."/><InfoRow icon={<Users size={18}/>} title="Pengalaman komunitas" text="Laporan sukarela, bukan unggahan kontak otomatis."/><InfoRow icon={<Flag size={18}/>} title="Konteks risiko" text="Kategori laporan dengan tingkat keyakinan transparan."/></div></div></section>
    <section id="community" className="relative z-10 mx-auto max-w-6xl px-5 py-16 sm:px-8">
      <div className="mb-6"><p className="section-kicker">COMMUNITY FIRST</p><h2 className="mt-3 text-2xl font-semibold">Bantu komunitas lebih waspada.</h2><p className="mt-2 text-sm text-hc-muted">Laporan ditinjau sebelum memengaruhi hasil pencarian. Jangan kirim data pribadi.</p></div>
      <ReportForm/>
      <div className="mb-6 mt-12"><p className="section-kicker">YOUR DATA, YOUR CONTROL</p><h3 className="mt-3 text-xl font-semibold">Perlu menarik laporan?</h3><p className="mt-2 text-sm text-hc-muted">Gunakan ID referensi yang diterima saat mengirim laporan.</p></div>
      <RemovalForm/>
      <div className="mb-6 mt-12"><p className="section-kicker">CORRECTION & SAFETY</p><h3 className="mt-3 text-xl font-semibold">Ada informasi yang perlu ditinjau?</h3><p className="mt-2 text-sm text-hc-muted">Kirim koreksi atau laporkan penyalahgunaan secara privat. Masukan tidak langsung mengubah hasil pencarian.</p></div>
      <FeedbackForm/>
    </section>
    <footer id="privacy" className="relative z-10 border-t border-hc-line/70"><div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-8 text-xs text-hc-muted sm:px-8 md:flex-row md:items-center md:justify-between"><p>© {new Date().getFullYear()} HaveContact. Independent community phone intelligence.</p><div className="flex flex-wrap items-center gap-x-5 gap-y-2"><a className="nav-link" href="/privacy.html">Kebijakan Privasi</a><a className="nav-link" href="/terms.html">Ketentuan Penggunaan</a><p className="flex items-center gap-2"><ShieldCheck size={14} className="text-hc-lime"/>Privacy-first by design</p></div></div></footer>
  </main>;
}
function Stat({icon,title,text}:{icon:ReactNode;title:string;text:string}) { return <div className="stat-card"><div className="mb-3 text-hc-lime">{icon}</div><p className="text-sm font-semibold">{title}</p><p className="mt-1 text-xs text-hc-muted">{text}</p></div>; }
function InfoRow({icon,title,text}:{icon:React.ReactNode;title:string;text:string}) { return <div className="glass flex gap-4 rounded-2xl p-4"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-hc-lime/10 text-hc-lime">{icon}</div><div><h3 className="text-sm font-semibold">{title}</h3><p className="mt-1 text-xs leading-5 text-hc-muted">{text}</p></div></div>; }
export default App;