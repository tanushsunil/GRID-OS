import {createHash} from 'node:crypto';
import {buildDocumentPdf,DEFAULT_TERMS} from './document-pdf';
import {loadPdfFonts} from './pdf-fonts';
import {accessToken,ensureFolder,savePdf,trash,needsReconnect,googleConfigured} from './google-drive';
import {serviceClient} from './supabase';
import type {Row} from './domain';

/** Keeps a workspace's Google Drive invoice folder in step with its invoices:
 *  every invoice is one PDF at  <folder>/<YYYY>/<MM Month>/<number> · <client> · <title>.pdf
 *  New or changed invoices are (re)uploaded, moved if their month changed, and deleted invoices' files are trashed. */
const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
export const monthFolder=(issueDate:string)=>({year:issueDate.slice(0,4),month:`${issueDate.slice(5,7)} ${MONTHS[Number(issueDate.slice(5,7))-1]}`});
const clean=(s:unknown)=>String(s??'').replace(/[\\/:*?"<>|\r\n]+/g,'-').replace(/\s+/g,' ').trim();
export const driveFileName=(inv:Row,clientName?:string)=>`${[clean(inv.number||'Draft'),clean(clientName),clean(inv.name)].filter(Boolean).join(' · ').slice(0,180)}.pdf`;


/** Everything the PDF depends on — if this changes, the Drive copy is refreshed. */
export function contentHash(inv:Row,client:Row|undefined,paid:number){
 const pick={n:inv.number,t:inv.name,s:inv.status,i:inv.issue_date,d:inv.due_date,x:inv.discount,p:inv.payment_terms,o:inv.notes,
  items:(inv.items||[]).map((i:Row)=>[i.service,i.description,i.quantity,i.unit,i.rate,i.tax]),c:client&&[client.name,client.contact,client.email,client.phone,client.billing_address,client.tax_id],paid};
 return createHash('sha256').update(JSON.stringify(pick)).digest('hex');
}

export type SyncResult={uploaded:number;removed:number;remaining:number;error?:string};
/** Sync one workspace (at most `limit` uploads per run; the rest follow on the next run). Never throws. */
export async function syncWorkspaceInvoices(workspaceId:string,{limit=25,db:injected}:{limit?:number;db?:any}={}):Promise<SyncResult>{
 const db=(injected??serviceClient()) as ReturnType<typeof serviceClient>;if(!db||!googleConfigured())return {uploaded:0,removed:0,remaining:0};
 // lease: skip if another sync for this workspace started in the last 3 minutes
 const now=new Date();
 const {data:lease}=await db.from('drive_connections').update({sync_lease:now.toISOString()}).eq('workspace_id',workspaceId).not('folder_id','is',null)
  .or(`sync_lease.is.null,sync_lease.lt."${new Date(now.getTime()-180000).toISOString()}"`).select('refresh_token,folder_id').maybeSingle();
 if(!lease)return {uploaded:0,removed:0,remaining:0};
 let uploaded=0,removed=0,remaining=0;
 try{
  const token=await accessToken(lease.refresh_token);
  const [{data:invoices,error:ie},{data:files},{data:payments}]=await Promise.all([
   db.from('invoices').select('*,items:invoice_items(*),client:clients(*)').eq('workspace_id',workspaceId).order('issue_date',{ascending:true}),
   db.from('drive_files').select('*').eq('workspace_id',workspaceId),
   db.from('payments').select('invoice_id,amount').eq('workspace_id',workspaceId),
  ]);
  if(ie)throw ie;
  const known=new Map((files||[]).map(f=>[f.invoice_id,f]));
  const paid=new Map<string,number>();for(const p of payments||[])paid.set(p.invoice_id,(paid.get(p.invoice_id)||0)+Number(p.amount));
  const folders=new Map<string,string>();
  const folderFor=async(issue:string)=>{const {year,month}=monthFolder(issue);const k=`${year}/${month}`;if(!folders.has(k)){const y=await ensureFolder(token,lease.folder_id!,year);folders.set(k,await ensureFolder(token,y,month));}return folders.get(k)!;};
  const todo=(invoices||[]).map(inv=>({inv,hash:contentHash(inv,inv.client,paid.get(inv.id)||0)})).filter(({inv,hash})=>known.get(inv.id)?.content_hash!==hash);
  remaining=Math.max(0,todo.length-limit);
  const f=await loadPdfFonts();
  for(const {inv,hash} of todo.slice(0,limit)){
   const folder=await folderFor(String(inv.issue_date));const prev=known.get(inv.id);
   const bytes=await buildDocumentPdf({kind:'invoice',doc:inv,client:inv.client,paid:paid.get(inv.id)||0,terms:[...DEFAULT_TERMS,inv.payment_terms,inv.notes].filter((t):t is string=>!!t&&!!String(t).trim()),fonts:f});
   const fileId=await savePdf(token,{name:driveFileName(inv,inv.client?.name),bytes,folder,existing:prev?{fileId:prev.file_id,folderId:prev.folder_id}:undefined});
   await db.from('drive_files').upsert({invoice_id:inv.id,workspace_id:workspaceId,file_id:fileId,folder_id:folder,content_hash:hash,synced_at:new Date().toISOString()});
   uploaded++;
  }
  // invoices that no longer exist: move their file to the Drive bin
  const live=new Set((invoices||[]).map(i=>i.id));
  for(const f of (files||[]).filter(f=>!live.has(f.invoice_id))){await trash(token,f.file_id);await db.from('drive_files').delete().eq('invoice_id',f.invoice_id);removed++;}
  await db.from('drive_connections').update({last_synced_at:new Date().toISOString(),last_error:null}).eq('workspace_id',workspaceId);
  return {uploaded,removed,remaining};
 }catch(err){
  const message=needsReconnect(err)?'Google Drive access has expired or was removed — reconnect it in Settings.':(err as Error).message||'Google Drive sync failed';
  console.error('[drive] sync failed',workspaceId,message);
  await db.from('drive_connections').update({last_error:message.slice(0,300)}).eq('workspace_id',workspaceId);
  return {uploaded,removed,remaining,error:message};
 }finally{
  await db.from('drive_connections').update({sync_lease:null}).eq('workspace_id',workspaceId);
 }
}

/** Sync every connected workspace (used by the nightly job). */
export async function syncAllWorkspaces(){
 const db=serviceClient();if(!db||!googleConfigured())return 0;
 const {data}=await db.from('drive_connections').select('workspace_id').not('folder_id','is',null);
 let n=0;for(const r of data||[])n+=(await syncWorkspaceInvoices(r.workspace_id,{limit:60})).uploaded;
 return n;
}
