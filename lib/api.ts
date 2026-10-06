import {NextResponse} from 'next/server';
/** JSON reply that is never cached by the browser or a proxy. */
export const reply=(body:unknown,status=200,headers:Record<string,string>={})=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store',...headers}});

export class BodyError extends Error{constructor(message:string,public status=400){super(message);}}
/** Read a JSON body with a size cap, so oversized or malformed requests are rejected early. */
export async function readJson(request:Request,maxBytes=256*1024):Promise<any>{
 const declared=Number(request.headers.get('content-length')||0);
 if(declared>maxBytes)throw new BodyError('That request is too large.',413);
 const text=await request.text();
 if(new TextEncoder().encode(text).length>maxBytes)throw new BodyError('That request is too large.',413);
 try{const value=JSON.parse(text);if(!value||typeof value!=='object')throw 0;return value;}catch{throw new BodyError('The request could not be read.');}
}

/** Fixed-window, in-memory rate limiter (per server instance). Bounded so it can't grow without limit. */
const buckets=new Map<string,{count:number;reset:number}>();
const MAX_KEYS=10000;
export function rateLimit(key:string,limit:number,windowMs:number,now=Date.now()){
 let b=buckets.get(key);
 if(!b||b.reset<=now){
  if(buckets.size>=MAX_KEYS){for(const [k,v] of buckets)if(v.reset<=now)buckets.delete(k);if(buckets.size>=MAX_KEYS)buckets.delete(buckets.keys().next().value!);}
  b={count:0,reset:now+windowMs};buckets.set(key,b);
 }
 b.count++;
 return {ok:b.count<=limit,retryAfter:Math.max(1,Math.ceil((b.reset-now)/1000))};
}
export const resetRateLimits=()=>buckets.clear();
/** Best-effort client address for rate limiting (first hop of x-forwarded-for, else x-real-ip). */
export const clientIp=(request:Request)=>request.headers.get('x-forwarded-for')?.split(',')[0].trim()||request.headers.get('x-real-ip')||'local';
export const tooMany=(retryAfter:number)=>reply({error:'Too many attempts. Please wait a moment and try again.'},429,{'Retry-After':String(retryAfter)});
/** Shared handler for anything unexpected: logs on the server, answers with a calm message. */
export function failure(err:unknown,{invalid='Please check the details and try again.',fallback='Something went wrong. Please try again.'}={}){
 if(err instanceof BodyError)return reply({error:err.message},err.status);
 if(err instanceof Error&&err.name==='ZodError')return reply({error:invalid},400);
 console.error('[api]',err);
 return reply({error:fallback},500);
}
