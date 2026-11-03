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

export default function BusinessClaimForm(){
  const [phone,setPhone]=useState("");const [businessName,setBusinessName]=useState("");const [website,setWebsite]=useState("");const [publicEmail,setPublicEmail]=useState("");const [proofUrl,setProofUrl]=useState("");const [token,setToken]=useState("");const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");
  const captcha=useRef<HTMLDivElement>(null);const widgetId=useRef<string>();
  useEffect(()=>{if(!SITE_KEY||!captcha.current)return;let cancelled=false;const render=()=>{if(!cancelled&&window.turnstile&&captcha.current)widgetId.current=window.turnstile.render(captcha.current,{sitekey:SITE_KEY,callback:setToken,"expired-callback":()=>setToken("")});};if(window.turnstile)render();else{const script=document.createElement("script");script.src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";script.async=true;script.onload=render;document.head.appendChild(script);}return()=>{cancelled=true;if(widgetId.current)window.turnstile?.remove(widgetId.current);};},[]);
  async function submit(e:FormEvent){e.preventDefault();setMessage("");const normalized=normalizePhone(phone);if(!API)return setMessage("API belum dikonfigurasi.");if(!normalized)return setMessage("Nomor telepon tidak valid.");if(!token)return setMessage("Selesaikan verifikasi keamanan.");setBusy(true);try{const r=await fetch(`${API}/api/v1/business-claims`,{method:"POST",headers:{"Content-Type":"application/json","X-Turnstile-Token":token},body:JSON.stringify({phone:normalized,businessName,website,publicEmail,proofUrl})});const d=await r.json() as {ok:boolean;error?:string};if(!r.ok||!d.ok)throw new Error(d.error??"Klaim gagal dikirim.");setMessage("Klaim diterima. Tim moderasi akan memeriksa website dan bukti keterkaitan nomor sebelum profil ditampilkan.");setPhone("");setBusinessName("");setWebsite("");setPublicEmail("");setProofUrl("");}catch(err){setMessage(err instanceof Error?err.message:"Terjadi kesalahan jaringan.");}finally{setBusy(false);setToken("");if(widgetId.current)window.turnstile?.reset(widgetId.current);}}
  return <form onSubmit={submit} className="glass grid gap-4 rounded-3xl p-5 sm:p-8">
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="grid gap-2 text-xs text-hc-muted">Nomor bisnis<input required value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+62 812..." inputMode="tel" className="glass-input"/></label>
      <label className="grid gap-2 text-xs text-hc-muted">Nama bisnis<input required minLength={2} maxLength={100} value={businessName} onChange={e=>setBusinessName(e.target.value)} placeholder="Nama resmi bisnis" className="glass-input"/></label>
    </div>
    <label className="grid gap-2 text-xs text-hc-muted">Website resmi (HTTPS)<input required type="url" value={website} onChange={e=>setWebsite(e.target.value)} placeholder="https://contoh.id" className="glass-input"/></label>
    <label className="grid gap-2 text-xs text-hc-muted">Email bisnis publik (opsional)<input type="email" value={publicEmail} onChange={e=>setPublicEmail(e.target.value)} placeholder="halo@contoh.id" className="glass-input"/></label>
    <label className="grid gap-2 text-xs text-hc-muted">URL bukti kepemilikan/pengelolaan nomor (opsional)<input type="url" value={proofUrl} onChange={e=>setProofUrl(e.target.value)} placeholder="Halaman resmi yang mencantumkan nomor ini" className="glass-input"/></label>
    <p className="text-xs leading-5 text-hc-muted">Hanya ajukan nomor yang memang dikelola bisnis Anda. Profil tidak tampil sampai pemeriksaan manual selesai. Bukti harus berupa halaman publik yang menghubungkan bisnis dengan nomor tersebut.</p>
    {SITE_KEY?<div ref={captcha}/>:<p className="text-xs text-amber-200">Turnstile belum dikonfigurasi.</p>}
    <button disabled={busy||!SITE_KEY} className="search-button w-fit" type="submit">{busy?"Mengirim...":"Ajukan verifikasi bisnis"}</button>
    {message&&<p role="status" className="rounded-xl border border-hc-line p-3 text-xs text-hc-muted">{message}</p>}
  </form>;
}
