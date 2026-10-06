/** Browser-side JSON requests that fail with a clear, human message instead of hanging or crashing. */
export class RequestError extends Error{constructor(message:string,public status=0,public data:any=null){super(message);this.name='RequestError';}}
const OFFLINE='You appear to be offline. Check your connection and try again.';

export async function requestJson<T=any>(url:string,{body,method=body===undefined?'GET':'POST',timeout=20000,retries=method==='GET'?1:0}:{body?:unknown;method?:string;timeout?:number;retries?:number}={}):Promise<T>{
 for(let attempt=0;;attempt++){
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeout);
  let res:Response;
  try{res=await fetch(url,{method,signal:controller.signal,cache:'no-store',headers:body===undefined?undefined:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});}
  catch(err){
   clearTimeout(timer);
   // Only reads are retried: repeating a write could save it twice.
   if(attempt<retries)continue;
   if(typeof navigator!=='undefined'&&navigator.onLine===false)throw new RequestError(OFFLINE);
   throw new RequestError((err as Error).name==='AbortError'?'The server took too long to respond. Please try again.':'Could not reach the server. Please try again.');
  }
  clearTimeout(timer);
  const text=await res.text().catch(()=>'');let data:any=null;
  try{data=text?JSON.parse(text):null;}catch{/* an HTML error page or a proxy message */}
  if(res.ok&&data!==null)return data as T;
  if(res.ok)throw new RequestError('The server sent an unexpected response. Please try again.',res.status);
  if(res.status>=500&&attempt<retries)continue;
  const fallback=res.status===429?'Too many attempts. Please wait a moment and try again.':res.status===401?'Your session has ended. Please sign in again.':res.status>=500?'The server ran into a problem. Please try again shortly.':'That request could not be completed.';
  throw new RequestError(typeof data?.error==='string'&&data.error?data.error:fallback,res.status,data);
 }
}
