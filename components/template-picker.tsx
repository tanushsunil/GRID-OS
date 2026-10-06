'use client';
import {useEffect,useRef,useState} from 'react';
import {X,FileText,Clapperboard,Package,CheckCircle2,ArrowLeft,LayoutTemplate} from 'lucide-react';
import {today,type Data} from '@/lib/domain';
import type {ProjectTemplate} from '@/lib/extras';

export type TemplateChoice={template:ProjectTemplate;name:string;client_id:string;owner_id:string;start_date:string};

export default function TemplatePicker({templates,data,members,defaults,onBlank,onCreate,onClose}:{templates:ProjectTemplate[];data:Data;members:any[];defaults:{client_id?:string;owner_id?:string};onBlank:()=>void;onCreate:(c:TemplateChoice)=>Promise<void>;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null);const [chosen,setChosen]=useState<ProjectTemplate|null>(null);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 const [value,setValue]=useState({name:'',client_id:defaults.client_id||data.clients[0]?.id||'',owner_id:defaults.owner_id||'',start_date:today()});
 useEffect(()=>{dialog.current?.showModal();},[]);
 const pick=(t:ProjectTemplate)=>{setChosen(t);setValue(v=>({...v,name:v.name||t.name}));};
 return <dialog ref={dialog} className="modal template-picker" onCancel={e=>{e.preventDefault();if(!busy)onClose();}}>
  <div className="modal-head"><div className="modal-title">{chosen&&<button className="icon-button" aria-label="Back to templates" onClick={()=>setChosen(null)}><ArrowLeft size={18}/></button>}<h2>{chosen?chosen.name:'Start a new project'}</h2></div><button className="icon-button" aria-label="Close" onClick={onClose}><X size={18}/></button></div>
  {!chosen?<div className="modal-content template-body">
   <p className="muted">Templates create the project with its tasks, deliverables and shoot already scheduled.</p>
   <div className="template-list">
    <button className="template-card blank" onClick={onBlank}><span className="template-icon"><FileText size={18}/></span><span><strong>Blank project</strong><small>Start from scratch</small></span></button>
    {templates.map(t=><button className="template-card" key={t.id} onClick={()=>pick(t)}><span className="template-icon"><LayoutTemplate size={18}/></span><span><strong>{t.name}</strong><small>{t.project_type} · {t.duration} days</small><span className="template-counts"><span><CheckCircle2 size={12}/>{t.tasks.length} tasks</span><span><Package size={12}/>{t.deliverables.length} deliverables</span>{t.shoots.length>0&&<span><Clapperboard size={12}/>{t.shoots.length} shoot{t.shoots.length===1?'':'s'}</span>}</span></span></button>)}
   </div>
  </div>
  :<form onSubmit={async e=>{e.preventDefault();setError('');if(!value.client_id){setError('Choose a client for this project.');return;}setBusy(true);try{await onCreate({template:chosen,...value});}catch(err){setError((err as Error).message);setBusy(false);}}}>
   <div className="modal-content template-body">
   <label>Project name<input required value={value.name} onChange={e=>setValue({...value,name:e.target.value})}/></label>
   <div className="form-grid">
    <label>Client<select required value={value.client_id} onChange={e=>setValue({...value,client_id:e.target.value})}><option value="">Choose a client</option>{data.clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
    <label>Project owner<select value={value.owner_id} onChange={e=>setValue({...value,owner_id:e.target.value})}><option value="">Unassigned</option>{members.map((m:any)=><option key={m.user_id} value={m.user_id}>{m.profile?.name}</option>)}</select></label>
   </div>
   <label>Start date<input type="date" required value={value.start_date} onChange={e=>setValue({...value,start_date:e.target.value})}/></label>
   <div className="template-preview">
    <h4>What gets created</h4>
    <ul>{chosen.shoots.map(s=><li key={'s'+s.name}><Clapperboard size={13}/>{s.name}<small>Day {s.offset}</small></li>)}{chosen.deliverables.map(d=><li key={'d'+d.name}><Package size={13}/>{d.name}<small>Day {d.offset}</small></li>)}{chosen.tasks.map(t=><li key={'t'+t.name}><CheckCircle2 size={13}/>{t.name}<small>Day {t.offset}</small></li>)}</ul>
   </div>
   {error&&<p className="notice error" role="alert">{error}</p>}
   </div>
   <div className="modal-footer"><button type="button" className="button" onClick={()=>setChosen(null)}>Back</button><button className="button primary" disabled={busy}>{busy?'Creating…':'Create project'}</button></div>
  </form>}
 </dialog>;
}
