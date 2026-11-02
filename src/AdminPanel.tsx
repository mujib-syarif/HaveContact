import { useCallback, useEffect, useState } from "react";
import { LockKeyhole, RefreshCw, ShieldCheck, LogOut, Check, X } from "lucide-react";

type Report = { id: string; category: string; description: string; status: string; created_at: string };
const API = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

export default function AdminPanel() {
  const [token,setToken]=useState("");
  const [draft,setDraft]=useState("");
  const [reports,setReports]=useState<Report[]>([]);
  const [status,setStatus]=useState("pending");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const load=useCallback(async()=>{
    if(!token||!API)return;
    setBusy(true);setMessage("");
    try{const r=await fetch(`${API}/api/admin/reports?status=${status}`,{headers:{Authorization:`Bearer ${token}`}});
      const d=await r.json() as {ok:boolean;reports?:Report[];error?:string};
      if(!r.ok||!d.ok)throw new Error(d.error??"Tidak dapat memuat antrean.");
      setReports(d.reports??[]);
    }catch(e){setMessage(e instanceof Error?e.message:"Terjadi kesalahan.");}
    finally{setBusy(false);}
  },[token,status]);
  useEffect(()=>{if(token)void load();},[token,status,load]);
  async function moderate(id:string,action:"approved"|"rejected"){
    setBusy(true);setMessage("");
    try{const r=await fetch(`${API}/api/admin/reports/${id}/moderate`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},body:JSON.stringify({action})});
      const d=await r.json() as {ok:boolean;error?:string};
      if(!r.ok||!d.ok)throw new Error(d.error??"Moderasi gagal.");
      setReports(old=>old.filter(item=>item.id!==id));setMessage(action==="approved"?"Laporan disetujui.":"Laporan ditolak.");
    }catch(e){setMessage(e instanceof Error?e.message:"Terjadi kesalahan.");}
    finally{setBusy(false);}
  }
  return <main className="relative min-h-screen overflow-hidden px-4 py-10 text-white sm:px-8">
    <div className="ambient ambient-one"/><div className="ambient ambient-two"/>
    <div className="relative z-10 mx-auto max-w-4xl">
      <header className="mb-8 flex items-center justify-between gap-4"><a href="/" className="flex items-center gap-3"><span className="brand-mark"><ShieldCheck size={19}/></span><span className="font-bold">HaveContact <span className="text-hc-lime">/ Admin</span></span></a><span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] text-hc-muted">PRIVATE AREA</span></header>
      <section className="admin-panel">
        <p className="section-kicker">MODERATION DESK</p><h1 className="mt-3 text-3xl font-semibold tracking-tight">Review community reports</h1><p className="mt-2 text-sm leading-6 text-hc-muted">Tinjau isi laporan secara objektif. Jangan menyetujui tuduhan yang tidak didukung pengalaman faktual.</p>
        {!token?<form className="mt-7 grid gap-3 sm:grid-cols-[1fr_auto]" onSubmit={e=>{e.preventDefault();setToken(draft);}}><label className="grid gap-2 text-xs text-hc-muted">Admin API token<input type="password" autoComplete="current-password" value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Masukkan secret admin" className="glass-input"/></label><button className="search-button self-end" type="submit"><LockKeyhole size={15}/> Connect</button></form>:<>
          <div className="mt-7 flex flex-wrap items-center justify-between gap-3"><div className="flex gap-2">{["pending","approved","rejected"].map(s=><button key={s} onClick={()=>setStatus(s)} className={status===s?"rounded-full border border-hc-lime/50 bg-hc-lime/10 px-3 py-2 text-xs text-hc-lime":"rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-hc-muted"}>{s}</button>)}</div><div className="flex gap-2"><button onClick={()=>void load()} disabled={busy} className="rounded-xl border border-white/15 bg-white/5 p-2.5 text-hc-muted" aria-label="Refresh"><RefreshCw size={16}/></button><button onClick={()=>{setToken("");setDraft("");setReports([]);}} className="rounded-xl border border-white/15 bg-white/5 p-2.5 text-hc-muted" aria-label="Logout"><LogOut size={16}/></button></div></div>
          <div className="mt-5 space-y-3">{busy&&!reports.length?<p className="py-10 text-center text-sm text-hc-muted">Loading moderation queue...</p>:reports.length===0?<div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-12 text-center"><ShieldCheck className="mx-auto mb-3 text-hc-lime" size={26}/><p className="text-sm font-medium">Tidak ada laporan di antrean ini.</p></div>:reports.map(report=><article key={report.id} className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-2"><span className="rounded-full border border-hc-lime/20 bg-hc-lime/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-hc-lime">{report.category}</span><time className="text-[11px] text-hc-muted">{new Date(report.created_at).toLocaleString()}</time></div><p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-white/90">{report.description}</p><p className="mt-3 break-all text-[10px] text-hc-muted">Report ID: {report.id}</p>{report.status==="pending"&&<div className="mt-4 flex gap-2"><button disabled={busy} onClick={()=>void moderate(report.id,"approved")} className="inline-flex items-center gap-2 rounded-xl border border-hc-lime/30 bg-hc-lime/10 px-3 py-2 text-xs font-semibold text-hc-lime"><Check size={14}/> Approve</button><button disabled={busy} onClick={()=>void moderate(report.id,"rejected")} className="inline-flex items-center gap-2 rounded-xl border border-rose-300/20 bg-rose-300/5 px-3 py-2 text-xs font-semibold text-rose-200"><X size={14}/> Reject</button></div>}</article>)}</div>
        </>}
        {message&&<p role="status" className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-hc-muted">{message}</p>}
        {!API&&<p className="mt-4 text-xs text-amber-200">VITE_API_BASE_URL belum dikonfigurasi.</p>}
      </section>
      <p className="mt-5 text-center text-[11px] text-hc-muted">Token hanya disimpan di state halaman selama sesi ini. Jangan bagikan akses admin.</p>
    </div>
  </main>;
}
