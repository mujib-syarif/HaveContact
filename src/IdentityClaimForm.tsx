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
const API=(import.meta.env.VITE_API_BASE_URL??"").replace(/\/$/,"");
const SITE_KEY=import.meta.env.VITE_TURNSTILE_SITE_KEY??"";

export default function IdentityClaimForm(){
  const [phone,setPhone]=useState("");const [displayName,setDisplayName]=useState("");const [profileUrl,setProfileUrl]=useState("");const [consent,setConsent]=useState(false);const [token,setToken]=useState("");const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");
  const captcha=useRef<HTMLDivElement>(null);const widgetId=useRef<string|undefined>(undefined);
  useEffect(()=>{if(!SITE_KEY||!captcha.current)return;let cancelled=false;const render=()=>{if(!cancelled&&window.turnstile&&captcha.current)widgetId.current=window.turnstile.render(captcha.current,{sitekey:SITE_KEY,callback:setToken,"expired-callback":()=>setToken("")});};if(window.turnstile)render();else{const script=document.createElement("script");script.src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";script.async=true;script.onload=render;document.head.appendChild(script);}return()=>{cancelled=true;if(widgetId.current)window.turnstile?.remove(widgetId.current);};},[]);
  async function submit(e:FormEvent){e.preventDefault();setMessage("");const normalized=normalizePhone(phone);if(!API)return setMessage("API belum dikonfigurasi.");if(!normalized)return setMessage("Nomor telepon tidak valid.");if(!consent)return setMessage("Persetujuan publik wajib diberikan.");if(!token)return setMessage("Selesaikan verifikasi keamanan.");setBusy(true);try{const r=await fetch(`${API}/api/v1/identity-claims`,{method:"POST",headers:{"Content-Type":"application/json","X-Turnstile-Token":token},body:JSON.stringify({phone:normalized,displayName,publicProfileUrl:profileUrl,consentPublic:consent})});const d=await r.json() as {ok:boolean;error?:string};if(!r.ok||!d.ok)throw new Error(d.error??"Pengajuan gagal.");setMessage("Pengajuan diterima. Nama hanya akan muncul setelah bukti profil publik ditinjau moderator.");setPhone("");setDisplayName("");setProfileUrl("");setConsent(false);}catch(err){setMessage(err instanceof Error?err.message:"Terjadi kesalahan jaringan.");}finally{setBusy(false);setToken("");if(widgetId.current)window.turnstile?.reset(widgetId.current);}}
  return <form onSubmit={submit} className="glass grid gap-4 rounded-3xl p-5 sm:p-8">
    <div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-2 text-xs text-hc-muted">Nomor milik Anda<input required value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+62 812..." inputMode="tel" className="glass-input"/></label><label className="grid gap-2 text-xs text-hc-muted">Nama tampilan publik<input required minLength={2} maxLength={80} value={displayName} onChange={e=>setDisplayName(e.target.value)} placeholder="Nama yang ingin ditampilkan" className="glass-input"/></label></div>
    <label className="grid gap-2 text-xs text-hc-muted">URL profil publik yang mencantumkan nama dan nomor<input required type="url" value={profileUrl} onChange={e=>setProfileUrl(e.target.value)} placeholder="https://profil-anda.id/kontak" className="glass-input"/></label>
    <label className="flex items-start gap-3 text-xs leading-5 text-hc-muted"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} className="mt-1"/>Saya pemilik/pengguna nomor ini dan secara sadar mengizinkan nama tampilan serta nomor saya dicocokkan di hasil pencarian publik HaveContact setelah peninjauan.</label>
    <p className="text-xs leading-5 text-hc-muted">Profil tidak dipublikasikan otomatis. Moderator memeriksa halaman publik yang menghubungkan nama dengan nomor. Jangan ajukan nomor orang lain. Pengajuan ini bukan verifikasi identitas hukum.</p>
    {SITE_KEY?<div ref={captcha}/>:<p className="text-xs text-amber-200">Turnstile belum dikonfigurasi.</p>}
    <button disabled={busy||!SITE_KEY||!consent} className="search-button w-fit" type="submit">{busy?"Mengirim...":"Ajukan nama publik"}</button>
    {message&&<p role="status" className="rounded-xl border border-hc-line p-3 text-xs text-hc-muted">{message}</p>}
  </form>;
}
