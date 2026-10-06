'use client';
import {useEffect,useState} from 'react';
import {KeyRound,Copy,Check,Loader2} from 'lucide-react';
import {requestJson} from '@/lib/http';
import {formatGridCode} from '@/lib/grid-code';

type Status={code:string|null;available?:boolean;setup?:boolean};

/** Settings → "Sign in with GRID": shows your permanent six-digit GRID number, with a copy button. */
export default function GridCodeSettings({demo,notify}:{demo:boolean;notify:(m:string)=>void}){
 const [status,setStatus]=useState<Status|null>(null);const [copied,setCopied]=useState(false);
 useEffect(()=>{if(demo)return;requestJson<Status>('/api/auth',{body:{action:'code_status'}}).then(setStatus).catch(()=>setStatus({code:null,available:false}));},[demo]);
 const copy=async(text:string)=>{try{await navigator.clipboard.writeText(text);setCopied(true);setTimeout(()=>setCopied(false),1600);}catch{notify('Copy isn’t available here — select the number and copy it.');}};

 if(demo)return <div className="settings-form"><p className="muted">Everyone gets a permanent six-digit GRID number to sign in with, instead of an email and password. This turns on once the workspace is connected to its database.</p></div>;
 if(!status)return <div className="settings-form"><p className="muted"><Loader2 size={14} className="auth-spin"/> Loading…</p></div>;
 if(!status.code)return <div className="settings-form"><p className="muted">{status.setup===false?'Sign in with GRID isn’t set up on the database yet. Ask your administrator to run the 007_login_codes.sql update.':'Your GRID number couldn’t be loaded right now. Try again in a moment.'}</p></div>;
 const shown=formatGridCode(status.code);
 return <div className="settings-form">
  <p>Your personal GRID number. On the sign-in page, choose <b>Sign in with GRID</b> and enter it instead of your email and password. It’s yours permanently.</p>
  <div className="grid-code-box"><KeyRound size={18}/><code aria-label="Your GRID number">{shown}</code><button type="button" className="button small" onClick={()=>copy(status.code!)}>{copied?<><Check size={14}/>Copied</>:<><Copy size={14}/>Copy</>}</button></div>
  {status.available===false&&<p className="muted">Ask your administrator to finish setting up Sign in with GRID on the server (the server key is missing).</p>}
 </div>;
}
