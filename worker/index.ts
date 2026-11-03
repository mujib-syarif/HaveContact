import { getPhoneMetadata, normalizePhone } from "../shared/phone";
import { readJsonObject } from "./request";

interface Env {
  DB: D1Database;
  PHONE_HASH_SECRET: string;
  TURNSTILE_SECRET?: string;
  ADMIN_API_TOKEN?: string;
  ALLOWED_ORIGINS?: string;
  APP_ENV?: string;
}
type RateResult = { allowed: boolean; retryAfter: number };
function cors(request: Request, env: Env): Headers {
  const origin = request.headers.get("Origin") ?? "";
  const allowed = (env.ALLOWED_ORIGINS ?? "").split(",").map(v=>v.trim()).filter(Boolean);
  const h = new Headers({
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Turnstile-Token, Authorization",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Cache-Control": "no-store"
  });
  if (origin && allowed.includes(origin)) h.set("Access-Control-Allow-Origin", origin);
  return h;
}
function json(request: Request, env: Env, data: unknown, status=200, extra: Record<string,string>={}): Response {
  const h=cors(request,env);h.set("Content-Type","application/json; charset=utf-8");
  for(const [k,v] of Object.entries(extra))h.set(k,v);
  return new Response(JSON.stringify(data),{status,headers:h});
}

async function hmac(value:string,secret:string):Promise<string>{
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const sig=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(value));
  return [...new Uint8Array(sig)].map(v=>v.toString(16).padStart(2,"0")).join("");
}
async function verifyTurnstile(token:string|null,secret?:string):Promise<boolean>{
  if(!secret||!token||token.length>2048)return false;
  try{
    const body=new FormData();body.set("secret",secret);body.set("response",token);
    const res=await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify",{method:"POST",body});
    if(!res.ok)return false;
    return (await res.json() as {success?:boolean}).success===true;
  }catch{return false;}
}
function safeEqual(a:string,b:string):boolean{
  const x=new TextEncoder().encode(a),y=new TextEncoder().encode(b);let diff=x.length^y.length;
  for(let i=0;i<Math.max(x.length,y.length);i++)diff|=(x[i]??0)^(y[i]??0);
  return diff===0;
}
async function rateLimit(request:Request,env:Env,scope:string,limit:number,windowSeconds:number):Promise<RateResult>{
  const ip=request.headers.get("CF-Connecting-IP")??"unknown";
  const key=await hmac(`${scope}:${ip}`,env.PHONE_HASH_SECRET);
  const now=Math.floor(Date.now()/1000),windowStart=Math.floor(now/windowSeconds)*windowSeconds;
  const row=await env.DB.prepare(`INSERT INTO request_limits (bucket_key,window_start,request_count) VALUES (?, ?, 1)
    ON CONFLICT(bucket_key) DO UPDATE SET
    request_count=CASE WHEN request_limits.window_start=excluded.window_start THEN request_limits.request_count+1 ELSE 1 END,
    window_start=excluded.window_start,
    updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
    RETURNING request_count`).bind(key,windowStart).first<{request_count:number}>();
  const count=row?.request_count??limit+1;
  return {allowed:count<=limit,retryAfter:Math.max(1,windowStart+windowSeconds-now)};
}

function allowedOrigin(request:Request,env:Env):boolean{
  const origin=request.headers.get("Origin");
  if(!origin)return true;
  const allowed=(env.ALLOWED_ORIGINS??"").split(",").map(v=>v.trim()).filter(Boolean);
  return allowed.includes(origin);
}
export default {
 async fetch(request:Request,env:Env):Promise<Response>{
  const url=new URL(request.url);
  if(!allowedOrigin(request,env))return json(request,env,{ok:false,error:"Origin not allowed"},403);
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers:cors(request,env)});
  if(request.method==="GET"&&url.pathname==="/api/health")return json(request,env,{ok:true,service:"havecontact-api",environment:env.APP_ENV??"unknown"});
  if(!env.DB||!env.PHONE_HASH_SECRET)return json(request,env,{ok:false,error:"Service is not configured"},503);

  if(url.pathname==="/api/admin/reports"&&request.method==="GET"){
    const auth=request.headers.get("Authorization")??"";
    const token=auth.startsWith("Bearer ")?auth.slice(7):"";
    if(!env.ADMIN_API_TOKEN||!safeEqual(token,env.ADMIN_API_TOKEN))return json(request,env,{ok:false,error:"Unauthorized"},401);
    const status=url.searchParams.get("status")??"pending";
    if(!["pending","approved","rejected"].includes(status))return json(request,env,{ok:false,error:"Invalid status"},400);
    const rows=await env.DB.prepare("SELECT id,category,description,status,created_at,moderation_reason FROM reports WHERE status=? ORDER BY created_at ASC LIMIT 100").bind(status).all();
    return json(request,env,{ok:true,reports:rows.results??[]});
  }
  const parts=url.pathname.split("/");
  const reportId=parts.length===6&&parts[1]==="api"&&parts[2]==="admin"&&parts[3]==="reports"&&parts[5]==="moderate"&&/^[a-f0-9-]{36}$/i.test(parts[4])?parts[4]:"";
  if(request.method==="POST"&&reportId){
    const auth=request.headers.get("Authorization")??"",token=auth.startsWith("Bearer ")?auth.slice(7):"";
    if(!env.ADMIN_API_TOKEN||!safeEqual(token,env.ADMIN_API_TOKEN))return json(request,env,{ok:false,error:"Unauthorized"},401);
    const parsedBody=await readJsonObject(request,2048);
    if(!parsedBody.data)return json(request,env,{ok:false,error:parsedBody.error??"Invalid JSON"},400);
    const body=parsedBody.data;
    if(body.action!=="approved"&&body.action!=="rejected")return json(request,env,{ok:false,error:"Invalid action"},400);
    const reason=typeof body.reason==="string"?body.reason.trim():"";
    if(reason.length>500)return json(request,env,{ok:false,error:"Moderation reason must be 500 characters or fewer"},400);
    if(body.action==="rejected"&&reason.length<5)return json(request,env,{ok:false,error:"A rejection reason of at least 5 characters is required"},400);
    const row=await env.DB.prepare("SELECT id,status FROM reports WHERE id=?").bind(reportId).first<{id:string;status:string}>();
    if(!row)return json(request,env,{ok:false,error:"Report not found"},404);
    if(row.status!=="pending")return json(request,env,{ok:false,error:"Report is no longer pending"},409);
    const update=await env.DB.prepare("UPDATE reports SET status=?,moderation_reason=?,moderated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND status='pending'").bind(body.action,reason||null,reportId).run();
    if((update.meta?.changes??0)!==1)return json(request,env,{ok:false,error:"Report changed; refresh the queue"},409);
    await env.DB.prepare("INSERT INTO moderation_logs (id,report_id,action,moderator_ref,reason) VALUES (?,?,?,'admin-api',?)").bind(crypto.randomUUID(),reportId,body.action,reason||null).run();
    return json(request,env,{ok:true,report:{id:reportId,status:body.action,reason:reason||null}});
  }

  if(request.method==="GET"&&url.pathname==="/api/v1/lookup"){
    const phone=normalizePhone(url.searchParams.get("phone"));
    if(!phone)return json(request,env,{ok:false,error:"Invalid phone number"},400);
    const rate=await rateLimit(request,env,"lookup",40,60);
    if(!rate.allowed)return json(request,env,{ok:false,error:"Too many lookups. Please wait before trying again."},429,{"Retry-After":String(rate.retryAfter)});
    const phoneHash=await hmac(phone,env.PHONE_HASH_SECRET);
    const row=await env.DB.prepare("SELECT category,COUNT(*) AS total FROM reports WHERE phone_hash=? AND status='approved' GROUP BY category").bind(phoneHash).all<{category:string;total:number}>();
    const reports=row.results??[];
    return json(request,env,{ok:true,result:{number:phone,metadata:getPhoneMetadata(phone),status:reports.length?"reported":"no_community_reports",reportCount:reports.reduce((sum,item)=>sum+item.total,0),categories:reports.map(item=>({name:item.category,count:item.total})),identity:null,disclaimer:"Community reports are not proof of identity or wrongdoing."}});
  }

  if(request.method==="POST"&&url.pathname==="/api/v1/reports"){
    const rate=await rateLimit(request,env,"report",5,3600);
    if(!rate.allowed)return json(request,env,{ok:false,error:"Report limit reached. Try again later."},429,{"Retry-After":String(rate.retryAfter)});
    if(!(await verifyTurnstile(request.headers.get("X-Turnstile-Token"),env.TURNSTILE_SECRET)))return json(request,env,{ok:false,error:"Bot verification failed or is not configured"},403);
    const parsedBody=await readJsonObject(request,12000);
    if(!parsedBody.data)return json(request,env,{ok:false,error:parsedBody.error??"Invalid JSON"},parsedBody.error==="Request body too large"?413:400);
    const body=parsedBody.data;
    const phone=normalizePhone(body.phone),category=body.category;
    const description=typeof body.description==="string"?body.description.trim():"";
    const categories=["spam","scam","telemarketing","business","other"];
    if(!phone||typeof category!=="string"||!categories.includes(category))return json(request,env,{ok:false,error:"Invalid phone number or category"},400);
    if(description.length<10||description.length>500)return json(request,env,{ok:false,error:"Description must be 10-500 characters"},400);
    if(/[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F]/.test(description))return json(request,env,{ok:false,error:"Description contains unsupported characters"},400);
    const phoneHash=await hmac(phone,env.PHONE_HASH_SECRET),id=crypto.randomUUID();
    await env.DB.prepare("INSERT OR IGNORE INTO phone_index (phone_hash,country_calling_code) VALUES (?,?)").bind(phoneHash,getPhoneMetadata(phone)?.countryCallingCode??null).run();
    await env.DB.prepare("INSERT INTO reports (id,phone_hash,category,description,status) VALUES (?,?,?,?,'pending')").bind(id,phoneHash,category,description).run();
    return json(request,env,{ok:true,report:{id,status:"pending"},message:"Report submitted for moderation."},201);
  }
  return json(request,env,{ok:false,error:"Not found"},404);
 }
};