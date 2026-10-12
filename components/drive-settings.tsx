'use client';
import {useEffect,useState} from 'react';
import {FolderOpen,RefreshCw,Unplug,ExternalLink,Loader2,AlertTriangle,CheckCircle2} from 'lucide-react';
import {requestJson} from '@/lib/http';
import {displayDate} from '@/lib/domain';

type Status={connected:boolean;configured?:boolean;setup?:boolean;pickerKey?:boolean;email?:string;folder_id?:string|null;folder_name?:string|null;last_synced_at?:string|null;last_error?:string|null;files?:number};
declare global{interface Window{gapi?:any;google?:any}}

/** Load Google's folder picker (once). */
let pickerReady:Promise<void>|null=null;
const loadPicker=()=>pickerReady??=new Promise<void>((resolve,reject)=>{
 const done=()=>window.gapi.load('picker',{callback:()=>resolve(),onerror:()=>reject(Error('Google picker failed to load'))});
 if(window.gapi)return done();
 const s=document.createElement('script');s.src='https://apis.google.com/js/api.js';s.async=true;s.onload=done;s.onerror=()=>{pickerReady=null;reject(Error('Couldn’t load Google’s folder picker. Check your connection.'));};document.head.appendChild(s);
});

/** Settings → "Invoices in Google Drive": connect a Google account, pick the folder, see sync status. */
export default function DriveSettings({demo,workspaceId,notify}:{demo:boolean;workspaceId:string;notify:(m:string)=>void}){
 const [status,setStatus]=useState<Status|null>(null);const [busy,setBusy]=useState(false);
 const call=(action:string,extra:object={})=>requestJson<any>('/api/google',{body:{action,workspace_id:workspaceId,...extra}});
 const load=()=>call('status').then(setStatus).catch(()=>setStatus({connected:false,configured:false}));
 useEffect(()=>{if(demo)return;load();
  const q=new URLSearchParams(window.location.search).get('drive');
  const msg:Record<string,string>={connected:'Google Drive connected — now choose the invoice folder',cancelled:'Google Drive connection was cancelled',error:'Couldn’t connect Google Drive. Please try again.','not-allowed':'Only managers and admins can connect Google Drive','not-configured':'Google Drive isn’t set up on the server yet','not-set-up':'Run the 009_google_drive.sql update in Supabase first'};
  if(q&&msg[q]){notify(msg[q]);window.history.replaceState(null,'',window.location.pathname);}
 },[demo,workspaceId]);

 async function pickFolder(){
  setBusy(true);
  try{
   const [{token}]=await Promise.all([call('token'),loadPicker()]);
   const g=window.google.picker;
   const view=new g.DocsView(g.ViewId.FOLDERS).setIncludeFolders(true).setSelectFolderEnabled(true).setMimeTypes('application/vnd.google-apps.folder');
   const picked=await new Promise<{id:string;name:string}|null>(resolve=>{
    new g.PickerBuilder().setTitle('Choose the folder for GRID OS invoices').addView(view).setOAuthToken(token)
     .setDeveloperKey(process.env.NEXT_PUBLIC_GOOGLE_API_KEY||'').setAppId(process.env.NEXT_PUBLIC_GOOGLE_APP_ID||'')
     .setCallback((d:any)=>{if(d.action===g.Action.PICKED)resolve({id:d.docs[0].id,name:d.docs[0].name});else if(d.action===g.Action.CANCEL)resolve(null);})
     .build().setVisible(true);
   });
   if(!picked)return;
   const res=await call('folder',{folder_id:picked.id});
   setStatus(s=>s&&{...s,folder_id:res.folder_id,folder_name:res.folder_name,files:0,last_error:null});
   notify(`Invoices will be saved to “${res.folder_name}”`);
  }catch(e){notify((e as Error).message);}finally{setBusy(false);}
 }
 const act=async(action:'sync'|'disconnect')=>{
  if(action==='disconnect'&&!confirm('Disconnect Google Drive? Invoices already in Drive stay there; new ones won’t be saved until you reconnect.'))return;
  setBusy(true);try{await call(action);notify(action==='sync'?'Syncing invoices to Google Drive…':'Google Drive disconnected');if(action==='sync')setTimeout(load,4000);await load();}catch(e){notify((e as Error).message);}finally{setBusy(false);}
 };

 if(demo)return <div className="settings-form"><p className="muted">Every invoice can be saved automatically as a PDF into a Google Drive folder, organised by year and month. This turns on once the workspace is connected to its database.</p></div>;
 if(!status)return <div className="settings-form"><p className="muted"><Loader2 size={14} className="auth-spin"/> Loading…</p></div>;
 if(status.setup===false)return <div className="settings-form"><p className="muted">Run the <b>009_google_drive.sql</b> update in Supabase to turn this on.</p></div>;
 if(!status.configured)return <div className="settings-form"><p className="muted">Google Drive isn’t set up on the server yet. Your administrator needs to add the Google keys (GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET) in Vercel.</p></div>;
 if(!status.connected)return <div className="settings-form">
  <p>Save every invoice — ones you create, imports and the monthly ones — as a PDF in Google Drive, organised <b>Year → Month</b>.</p>
  <div><a className="button primary" href={`/api/google/connect?workspace=${workspaceId}`}><FolderOpen size={15}/>Connect Google Drive</a></div>
  <p className="muted">GRID OS only gets access to the folder you choose and the files it saves — nothing else in your Drive.</p>
 </div>;
 return <div className="settings-form">
  <p className="muted">Connected as <b>{status.email||'your Google account'}</b>.</p>
  {status.folder_id?<div className="billing-summary">
   <span className="billing-icon"><FolderOpen size={18}/></span>
   <div><strong>{status.folder_name}</strong><small>{status.files||0} invoice{status.files===1?'':'s'} saved{status.last_synced_at?` · last synced ${displayDate(status.last_synced_at.slice(0,10))}`:''} · organised Year → Month</small></div>
   <a className="button small" href={`https://drive.google.com/drive/folders/${status.folder_id}`} target="_blank" rel="noreferrer"><ExternalLink size={14}/>Open in Drive</a>
  </div>:<p><b>One more step:</b> choose the folder where invoices should be saved.</p>}
  {status.last_error?<p className="notice error" role="alert"><AlertTriangle size={15}/>{status.last_error}</p>:status.folder_id&&status.last_synced_at?<p className="muted"><CheckCircle2 size={14}/> New and changed invoices are saved automatically.</p>:null}
  {!status.pickerKey&&<p className="muted">The folder picker needs NEXT_PUBLIC_GOOGLE_API_KEY and NEXT_PUBLIC_GOOGLE_APP_ID set in Vercel.</p>}
  <div className="center-actions" style={{justifyContent:'flex-start'}}>
   <button className={`button ${status.folder_id?'':'primary'}`} disabled={busy||!status.pickerKey} onClick={pickFolder}>{busy?<Loader2 size={15} className="auth-spin"/>:<FolderOpen size={15}/>}{status.folder_id?'Change folder':'Choose folder'}</button>
   {status.folder_id&&<button className="button" disabled={busy} onClick={()=>act('sync')}><RefreshCw size={15}/>Sync now</button>}
   <button className="button" disabled={busy} onClick={()=>act('disconnect')}><Unplug size={15}/>Disconnect</button>
  </div>
 </div>;
}
