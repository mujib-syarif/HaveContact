import { useEffect, useRef, useState, type FormEvent } from "react";
import { Flag, Send } from "lucide-react";
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

export default function FeedbackForm() {
  const [phone,setPhone]=useState("");
  const [requestType,setRequestType]=useState("correction");
  const [details,setDetails]=useState("");
  const [token,setToken]=useState("");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const captcha=useRef<HTMLDivElement>(null);
  const widgetId=useRef<string|undefined>(undefined);

  useEffect(()=>{
    if(!SITE_KEY||!captcha.current)return;
    let cancelled=false;
    const render=()=>{
      if(!cancelled&&window.turnstile&&captcha.current){
        widgetId.current=window.turnstile.render(captcha.current,{sitekey:SITE_KEY,callback:setToken,"expired-callback":()=>setToken("")});
      }
    };
    if(window.turnstile)render();
    else {
      const existing=document.querySelector<HTMLScriptElement>('script[src*="challenges.cloudflare.com/turnstile"]');
      if(existing)existing.addEventListener("load",render,{once:true});
      else {
        const script=document.createElement("script");
        script.src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.async=true;script.onload=render;document.head.appendChild(script);
      }
    }
    return ()=>{
      cancelled=true;
      if(widgetId.current)window.turnstile?.remove(widgetId.current);
      widgetId.current=undefined;
    };
  },[]);

  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setMessage("");
    const normalized=normalizePhone(phone);
    if(!API)return setMessage("API belum dikonfigurasi.");
    if(!normalized)return setMessage("Nomor telepon tidak valid.");
    if(!token)return setMessage("Selesaikan verifikasi keamanan terlebih dahulu.");
    setBusy(true);
    try{
      const response=await fetch(`${API}/api/v1/feedback`,{
        method:"POST",
        headers:{"Content-Type":"application/json","X-Turnstile-Token":token},
        body:JSON.stringify({phone:normalized,requestType,details})
      });
      const data=await response.json() as {ok:boolean;error?:string};
      if(!response.ok||!data.ok)throw new Error(data.error??"Pengiriman gagal.");
      setMessage("Masukan diterima dan masuk antrean peninjauan privat.");
      setPhone("");setDetails("");setToken("");
    }catch(error){setMessage(error instanceof Error?error.message:"Terjadi kesalahan jaringan.");}
    finally{setBusy(false);setToken("");if(widgetId.current)window.turnstile?.reset(widgetId.current);}
  }

  return <form onSubmit={submit} className="glass grid gap-4 rounded-3xl p-5 sm:p-8">
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="grid gap-2 text-xs text-hc-muted">Nomor yang perlu ditinjau
        <input required value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+62 812..." inputMode="tel" className="glass-input"/>
      </label>
      <label className="grid gap-2 text-xs text-hc-muted">Jenis masukan
        <select value={requestType} onChange={e=>setRequestType(e.target.value)} className="glass-input">
          <option value="correction">Permintaan koreksi</option><option value="abuse">Laporkan penyalahgunaan</option>
        </select>
      </label>
    </div>
    <label className="grid gap-2 text-xs text-hc-muted">Detail (10-500 karakter)
      <textarea required minLength={10} maxLength={500} rows={4} value={details} onChange={e=>setDetails(e.target.value)} placeholder="Jelaskan bagian yang perlu ditinjau. Hindari data pribadi." className="glass-input min-h-24 resize-y"/>
    </label>
    <p className="text-xs leading-5 text-hc-muted">Nomor hanya digunakan untuk pencocokan privat melalui HMAC. Masukan tidak ditampilkan ke publik dan harus ditinjau admin.</p>
    {SITE_KEY?<div ref={captcha}/>:<p className="text-xs text-amber-200">Tambahkan VITE_TURNSTILE_SITE_KEY untuk mengaktifkan verifikasi.</p>}
    <div className="flex flex-wrap items-center justify-between gap-3">
      <button disabled={busy||!SITE_KEY} className="search-button" type="submit">{busy?"Mengirim...":"Kirim masukan"} <Flag size={15}/><Send size={14}/></button>
      <span className="text-xs text-hc-muted">Privat. Tidak otomatis dipublikasikan.</span>
    </div>
    {message&&<p role="status" className="rounded-xl border border-hc-line p-3 text-xs text-hc-muted">{message}</p>}
  </form>;
}
