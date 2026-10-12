/** Minimal Google OAuth + Drive v3 client (server only), using plain fetch.
 *  Scope: drive.file — GRID OS can only see files it created and the folder you pick in Google's picker. */
export const DRIVE_SCOPE='https://www.googleapis.com/auth/drive.file';
const FOLDER='application/vnd.google-apps.folder';
const API='https://www.googleapis.com/drive/v3';
const UPLOAD='https://www.googleapis.com/upload/drive/v3';

export const googleConfigured=()=>!!(process.env.GOOGLE_CLIENT_ID&&process.env.GOOGLE_CLIENT_SECRET);

export function authUrl(state:string,redirectUri:string){
 const q=new URLSearchParams({client_id:process.env.GOOGLE_CLIENT_ID!,redirect_uri:redirectUri,response_type:'code',scope:`${DRIVE_SCOPE} openid email`,access_type:'offline',prompt:'consent',include_granted_scopes:'true',state});
 return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

async function tokenRequest(params:Record<string,string>){
 const res=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:process.env.GOOGLE_CLIENT_ID!,client_secret:process.env.GOOGLE_CLIENT_SECRET!,...params}),signal:AbortSignal.timeout(15000)});
 const data=await res.json().catch(()=>({}));
 if(!res.ok)throw new DriveError(data.error_description||data.error||'Google sign-in failed',res.status,data.error);
 return data as {access_token:string;expires_in:number;refresh_token?:string;id_token?:string};
}
/** Exchange the sign-in code for tokens; also returns the Google account's email (from Google's own token response). */
export async function exchangeCode(code:string,redirectUri:string){
 const t=await tokenRequest({code,redirect_uri:redirectUri,grant_type:'authorization_code'});
 let email:string|null=null;
 try{email=JSON.parse(Buffer.from(String(t.id_token).split('.')[1],'base64url').toString()).email??null;}catch{}
 return {...t,email};
}
const cache=new Map<string,{token:string;until:number}>();
/** A short-lived access token from the stored refresh token (cached until shortly before it expires). */
export async function accessToken(refreshToken:string){
 const hit=cache.get(refreshToken);if(hit&&hit.until>Date.now())return hit.token;
 const t=await tokenRequest({refresh_token:refreshToken,grant_type:'refresh_token'});
 cache.set(refreshToken,{token:t.access_token,until:Date.now()+(t.expires_in-120)*1000});
 return t.access_token;
}
export async function revoke(refreshToken:string){try{await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refreshToken)}`,{method:'POST',signal:AbortSignal.timeout(10000)});}catch{}cache.delete(refreshToken);}

export class DriveError extends Error{constructor(message:string,public status=0,public reason?:string){super(message);this.name='DriveError';}}
/** True when Google says the connection is no longer valid (revoked or expired), so the user must reconnect. */
export const needsReconnect=(e:unknown)=>e instanceof DriveError&&(e.reason==='invalid_grant'||e.status===401);

async function call(token:string,url:string,init:RequestInit={}){
 const res=await fetch(url,{...init,headers:{Authorization:`Bearer ${token}`,...(init.headers||{})},signal:AbortSignal.timeout(30000)});
 const data=await res.json().catch(()=>({}));
 if(!res.ok)throw new DriveError(data?.error?.message||`Google Drive error ${res.status}`,res.status,data?.error?.errors?.[0]?.reason||data?.error?.status);
 return data;
}
const esc=(s:string)=>s.replace(/\\/g,'\\\\').replace(/'/g,"\\'");

/** Folder metadata (checks GRID OS can reach it). */
export const folderInfo=(token:string,id:string)=>call(token,`${API}/files/${encodeURIComponent(id)}?fields=id,name,mimeType,trashed&supportsAllDrives=true`) as Promise<{id:string;name:string;mimeType:string;trashed:boolean}>;

/** Find a sub-folder by name inside `parent`, creating it if missing. */
export async function ensureFolder(token:string,parent:string,name:string){
 const q=`'${esc(parent)}' in parents and name='${esc(name)}' and mimeType='${FOLDER}' and trashed=false`;
 const found=await call(token,`${API}/files?${new URLSearchParams({q,fields:'files(id,name)',pageSize:'1',supportsAllDrives:'true',includeItemsFromAllDrives:'true'})}`);
 if(found.files?.[0]?.id)return found.files[0].id as string;
 const made=await call(token,`${API}/files?fields=id&supportsAllDrives=true`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,mimeType:FOLDER,parents:[parent]})});
 return made.id as string;
}

function multipart(metadata:object,bytes:Uint8Array){
 const boundary='grid'+Math.random().toString(36).slice(2);
 const head=`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`;
 const tail=`\r\n--${boundary}--`;
 const h=new TextEncoder().encode(head),t=new TextEncoder().encode(tail);
 const body=new Uint8Array(h.length+bytes.length+t.length);body.set(h,0);body.set(bytes,h.length);body.set(t,h.length+bytes.length);
 return {body,type:`multipart/related; boundary=${boundary}`};
}
/** Create the PDF in `folder`, or (with `existing`) replace its content, rename it and move it if the folder changed. */
export async function savePdf(token:string,{name,bytes,folder,existing}:{name:string;bytes:Uint8Array;folder:string;existing?:{fileId:string;folderId:string}}){
 if(existing){
  const move=existing.folderId!==folder?`&addParents=${encodeURIComponent(folder)}&removeParents=${encodeURIComponent(existing.folderId)}`:'';
  const {body,type}=multipart({name},bytes);
  try{
   const r=await call(token,`${UPLOAD}/files/${encodeURIComponent(existing.fileId)}?uploadType=multipart&fields=id&supportsAllDrives=true${move}`,{method:'PATCH',headers:{'Content-Type':type},body});
   return r.id as string;
  }catch(e){if(!(e instanceof DriveError&&e.status===404))throw e;} // the file was deleted in Drive: make a new one
 }
 const {body,type}=multipart({name,parents:[folder],mimeType:'application/pdf'},bytes);
 const r=await call(token,`${UPLOAD}/files?uploadType=multipart&fields=id&supportsAllDrives=true`,{method:'POST',headers:{'Content-Type':type},body});
 return r.id as string;
}
export async function trash(token:string,fileId:string){
 try{await call(token,`${API}/files/${encodeURIComponent(fileId)}?supportsAllDrives=true`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({trashed:true})});}
 catch(e){if(!(e instanceof DriveError&&e.status===404))throw e;}
}
