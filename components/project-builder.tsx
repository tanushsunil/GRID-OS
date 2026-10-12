'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import {X,ArrowLeft,ArrowRight,FileText,LayoutTemplate,Clapperboard,Film,Image as ImageIcon,Video,LayoutGrid,Smartphone,Package,CheckCircle2,Plus,Minus,Trash2,Wand2,Flag} from 'lucide-react';
import {today,type Data} from '@/lib/domain';
import {addDays} from '@/lib/extras';
import type {ProjectTemplate} from '@/lib/extras';
import {BUILT_IN_KINDS,syncPlan,defaultTasks,planFromTemplate,planToTemplate,stackRows,autoDay,type Kind,type PlanItem,type Lane} from '@/lib/project-plan';

export type TemplateChoice={template:ProjectTemplate;name:string;client_id:string;owner_id:string;start_date:string};
const ICONS:Record<string,any>={shoot:Clapperboard,reel:Film,photos:ImageIcon,film:Video,post:LayoutGrid,story:Smartphone,task:CheckCircle2};
const LANES:{id:Lane;label:string}[]=[{id:'shoot',label:'Shoots'},{id:'deliverable',label:'Deliverables'},{id:'task',label:'Tasks'}];
const PROJECT_TYPES=['Social content','Campaign film','Photography','Event','Brand film','Other'];
const DAY_W=40,SPAN=3,ROW_H=38,LABEL_W=112;
const fmt=(iso:string,o:Intl.DateTimeFormatOptions)=>new Intl.DateTimeFormat('en-IN',{...o,timeZone:'UTC'}).format(new Date(iso+'T12:00:00Z'));

/** New project: 1 · details, 2 · deliverables (counters), 3 · roadmap (drag-and-drop timeline). */
export default function ProjectBuilder({templates,data,members,defaults,onCreate,onSaveTemplate,onClose}:{templates:ProjectTemplate[];data:Data;members:any[];defaults:{client_id?:string;owner_id?:string};onCreate:(c:TemplateChoice)=>Promise<void>;onSaveTemplate:(t:ProjectTemplate)=>void;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null);
 const [step,setStep]=useState<0|1|2|3>(0);const [base,setBase]=useState<ProjectTemplate|null>(null);
 const [value,setValue]=useState({name:'',client_id:defaults.client_id||data.clients[0]?.id||'',owner_id:defaults.owner_id||'',start_date:today(),project_type:'Social content'});
 const [kinds,setKinds]=useState<Kind[]>(BUILT_IN_KINDS);
 // counters and plan change together, always from the latest state (fast repeated clicks are never lost)
 const [plan,setPlan]=useState<{counts:Record<string,number>;items:PlanItem[]}>({counts:{},items:[]});const {counts,items}=plan;
 const setItems=(f:(i:PlanItem[])=>PlanItem[])=>setPlan(p=>({...p,items:f(p.items)}));
 const [customName,setCustomName]=useState('');const [saveAs,setSaveAs]=useState(false);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 useEffect(()=>{dialog.current?.showModal();},[]);

 const begin=(t:ProjectTemplate|null)=>{
  setBase(t);
  if(t){const p=planFromTemplate(t);setPlan(p);setValue(v=>({...v,name:v.name||t.name,project_type:PROJECT_TYPES.includes(t.project_type)?t.project_type:'Other'}));}
  else{const c={shoot:1};setPlan({counts:c,items:syncPlan([],c,BUILT_IN_KINDS)});}
  setStep(1);
 };
 const bump=(id:string,delta:number)=>setPlan(p=>{const next={...p.counts,[id]:Math.max(0,Math.min(60,(p.counts[id]||0)+delta))};return {counts:next,items:syncPlan(p.items,next,kinds)};});
 const addKind=()=>{const label=customName.trim();if(!label)return;const k:Kind={id:'custom-'+Math.random().toString(36).slice(2,8),label,singular:label,lane:'deliverable',type:'Other'};const nk=[...kinds,k];setKinds(nk);setCustomName('');setPlan(p=>{const next={...p.counts,[k.id]:1};return {counts:next,items:syncPlan(p.items,next,nk)};});};
 const toRoadmap=()=>{setError('');if(!value.name.trim())return setError('Give the project a name.');if(!value.client_id)return setError('Choose a client for this project.');
  if(!items.some(i=>i.lane==='task')&&!base)setItems(it=>[...it,...defaultTasks(it)]);setStep(2);};
 const create=async()=>{
  setError('');if(!items.length)return setError('Add at least one shoot, deliverable or task.');setBusy(true);
  try{
   const template=planToTemplate(items,{name:value.name.trim(),project_type:value.project_type,brief:base?.brief||''});
   if(saveAs)onSaveTemplate({...template,name:`${value.name.trim()} template`});
   await onCreate({template,name:value.name.trim(),client_id:value.client_id,owner_id:value.owner_id,start_date:value.start_date});
  }catch(e){setError((e as Error).message);setBusy(false);}
 };
 const total=Object.values(counts).reduce((a,b)=>a+b,0);
 const close=()=>{if(busy)return;if(step>0&&!confirm('Close the project builder? Your plan won’t be saved.'))return;onClose();};

 return <dialog ref={dialog} className="modal project-builder" onCancel={e=>{e.preventDefault();close();}}>
  <div className="modal-head">
   <div className="modal-title">{step>0&&<button className="icon-button" aria-label="Back" onClick={()=>setStep(s=>(s-1) as 0|1|2)}><ArrowLeft size={18}/></button>}<h2>{step===0?'Start a new project':value.name||'New project'}</h2></div>
   {step>0&&<ol className="pb-steps" aria-label="Steps">{['Details','Deliverables','Roadmap'].map((s,i)=><li key={s} className={step===i+1?'on':step>i+1?'done':''}><span>{i+1}</span>{s}</li>)}</ol>}
   <button className="icon-button" aria-label="Close" onClick={close}><X size={18}/></button>
  </div>

  {step===0&&<div className="modal-content template-body">
   <p className="muted">Start blank and build it up, or start from a template and adjust it.</p>
   <div className="template-list">
    <button className="template-card blank" onClick={()=>begin(null)}><span className="template-icon"><FileText size={18}/></span><span><strong>Build from scratch</strong><small>Choose the deliverables, then map the roadmap</small></span></button>
    {templates.map(t=><button className="template-card" key={t.id} onClick={()=>begin(t)}><span className="template-icon"><LayoutTemplate size={18}/></span><span><strong>{t.name}</strong><small>{t.project_type} · {t.duration} days · {t.shoots.length} shoot{t.shoots.length===1?'':'s'}, {t.deliverables.length} deliverables</small></span></button>)}
   </div>
  </div>}

  {step===1&&<div className="modal-content template-body">
   <label>Project name<input required autoFocus value={value.name} onChange={e=>setValue({...value,name:e.target.value})}/></label>
   <div className="form-grid">
    <label>Client<select required value={value.client_id} onChange={e=>setValue({...value,client_id:e.target.value})}><option value="">Choose a client</option>{data.clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
    <label>Project owner<select value={value.owner_id} onChange={e=>setValue({...value,owner_id:e.target.value})}><option value="">Unassigned</option>{members.map((m:any)=><option key={m.user_id} value={m.user_id}>{m.profile?.name||m.profile?.email}</option>)}</select></label>
    <label>Project type<select value={value.project_type} onChange={e=>setValue({...value,project_type:e.target.value})}>{PROJECT_TYPES.map(t=><option key={t}>{t}</option>)}</select></label>
    <label>Start date<input type="date" required value={value.start_date} onChange={e=>setValue({...value,start_date:e.target.value})}/></label>
   </div>
   <div className="pb-counters">
    <h4>What’s included</h4>
    {kinds.map(k=>{const Icon=ICONS[k.id]||Package;const n=counts[k.id]||0;return <div className={`pb-counter ${n?'active':''}`} key={k.id}>
     <span className="pb-counter-icon"><Icon size={16}/></span><span className="pb-counter-label">{k.label}</span>
     <div className="pb-stepper" role="group" aria-label={k.label}>
      <button type="button" aria-label={`One fewer ${k.singular}`} disabled={!n} onClick={()=>bump(k.id,-1)}><Minus size={14}/></button>
      <output aria-live="polite">{n}</output>
      <button type="button" aria-label={`One more ${k.singular}`} onClick={()=>bump(k.id,1)}><Plus size={14}/></button>
     </div>
    </div>;})}
    <form className="pb-add-kind" onSubmit={e=>{e.preventDefault();addKind();}}><input placeholder="Add another type, e.g. Podcast episode" value={customName} maxLength={40} onChange={e=>setCustomName(e.target.value)}/><button className="button small" disabled={!customName.trim()}><Plus size={14}/>Add</button></form>
   </div>
   {error&&<p className="notice error" role="alert">{error}</p>}
  </div>}

  {step===2&&<div className="modal-content pb-roadmap-body">
   <Roadmap items={items} setItems={setItems} start={value.start_date} onRemove={i=>setPlan(p=>({items:p.items.filter(x=>x.id!==i.id),counts:i.lane==='task'?p.counts:{...p.counts,[i.kind]:Math.max(0,(p.counts[i.kind]||0)-1)}}))}
    onReset={()=>setItems(it=>it.map(i=>{if(i.lane==='task')return i;const same=it.filter(x=>x.kind===i.kind);const k=kinds.find(x=>x.id===i.kind)!;return {...i,day:autoDay(k,same.indexOf(i),it)};}))}/>
   <label className="pb-save"><input type="checkbox" checked={saveAs} onChange={e=>setSaveAs(e.target.checked)}/>Save this plan as a template for next time</label>
   {error&&<p className="notice error" role="alert">{error}</p>}
  </div>}

  {step>0&&<div className="modal-footer">
   <small className="muted pb-summary">{counts.shoot||0} shoot{counts.shoot===1?'':'s'} · {total-(counts.shoot||0)} deliverable{total-(counts.shoot||0)===1?'':'s'}{step===2?` · ${items.filter(i=>i.lane==='task').length} tasks`:''}</small>
   <button type="button" className="button" onClick={()=>setStep(s=>(s-1) as 0|1|2)}>Back</button>
   {step===1?<button type="button" className="button primary" onClick={toRoadmap}>Map the roadmap<ArrowRight size={16}/></button>
    :<button type="button" className="button primary" disabled={busy} onClick={create}>{busy?'Creating…':'Create project'}</button>}
  </div>}
 </dialog>;
}

/** Drag-and-drop timeline: one column per day, a lane each for shoots, deliverables and tasks. */
function Roadmap({items,setItems,start,onRemove,onReset}:{items:PlanItem[];setItems:(f:(i:PlanItem[])=>PlanItem[])=>void;start:string;onRemove:(i:PlanItem)=>void;onReset:()=>void}){
 const scroller=useRef<HTMLDivElement>(null);const [drag,setDrag]=useState<{id:string;from:number;x:number;day:number}|null>(null);const [editing,setEditing]=useState<string|null>(null);
 const view=drag?items.map(i=>i.id===drag.id?{...i,day:drag.day}:i):items;
 const end=Math.max(...view.map(i=>i.day),0);const days=Math.max(21,end+SPAN+7);
 const lanes=useMemo(()=>LANES.map(l=>({...l,...stackRows(view.filter(i=>i.lane===l.id),SPAN)})),[view]);
 const move=(id:string,day:number)=>setItems(it=>it.map(i=>i.id===id?{...i,day:Math.max(0,Math.min(365,day))}:i));
 const onDown=(e:React.PointerEvent,i:PlanItem)=>{if(editing||(e.target as Element).closest('button,input'))return;try{(e.currentTarget as Element).setPointerCapture(e.pointerId);}catch{/* keep dragging without capture */}setDrag({id:i.id,from:i.day,x:e.clientX,day:i.day});};
 const onMove=(e:React.PointerEvent)=>{if(!drag)return;const day=Math.max(0,drag.from+Math.round((e.clientX-drag.x)/DAY_W));if(day!==drag.day)setDrag({...drag,day});
  const s=scroller.current;if(s){const r=s.getBoundingClientRect();if(e.clientX>r.right-40)s.scrollLeft+=12;else if(e.clientX<r.left+LABEL_W+30)s.scrollLeft-=12;}};
 const onUp=()=>{if(drag){move(drag.id,drag.day);setDrag(null);}};
 const addTask=()=>{const id=Math.random().toString(36).slice(2,10);setItems(it=>[...it,{id,kind:'task',lane:'task',type:'Task',name:'New task',day:Math.max(1,...it.filter(i=>i.lane==='task').map(i=>i.day))+1}]);setEditing(id);};
 return <div className="pb-roadmap">
  <div className="pb-roadmap-bar"><p className="muted">Drag cards to set their day. Arrow keys move a selected card (Shift = a week); Enter renames.</p>
   <div className="center-actions"><button type="button" className="button small" onClick={addTask}><Plus size={14}/>Task</button><button type="button" className="button small" onClick={onReset}><Wand2 size={14}/>Auto-arrange</button></div></div>
  <div className="pb-timeline" ref={scroller} style={{['--day' as any]:DAY_W+'px',['--label' as any]:LABEL_W+'px'}}>
   <div className="pb-grid" style={{width:LABEL_W+days*DAY_W}}>
    <div className="pb-days"><div className="pb-corner"/>{Array.from({length:days},(_,d)=>{const iso=addDays(start,d);const dow=new Date(iso+'T12:00:00Z').getUTCDay();return <div key={d} className={`pb-day ${dow===0||dow===6?'weekend':''}`} title={fmt(iso,{weekday:'long',day:'numeric',month:'long'})}>
     {(d===0||iso.endsWith('-01'))&&<span className="pb-month">{fmt(iso,{month:'short'})}</span>}<small>{fmt(iso,{weekday:'narrow'})}</small><b>{Number(iso.slice(8))}</b></div>;})}</div>
    {lanes.map(l=><div key={l.id} className={`pb-lane ${l.id}`} style={{height:l.rows*ROW_H+12}}>
     <div className="pb-lane-label">{l.label}</div>
     <div className="pb-lane-track">
      {Array.from({length:days},(_,d)=>{const dow=new Date(addDays(start,d)+'T12:00:00Z').getUTCDay();return dow===0||dow===6?<span key={d} className="pb-weekend" style={{left:d*DAY_W}}/>:null;})}
      {view.filter(i=>i.lane===l.id).map(i=>{const Icon=ICONS[i.kind]||(i.lane==='task'?CheckCircle2:Package);const iso=addDays(start,i.day);
       return <div key={i.id} role="button" tabIndex={0} aria-label={`${i.name}, ${fmt(iso,{day:'numeric',month:'short'})}. Use arrow keys to move.`} className={`pb-card ${i.lane} ${drag?.id===i.id?'dragging':''}`}
        style={{left:i.day*DAY_W+2,top:(l.rowOf.get(i.id)||0)*ROW_H+6,width:SPAN*DAY_W-4}}
        onPointerDown={e=>onDown(e,i)} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={()=>setDrag(null)} onDoubleClick={()=>setEditing(i.id)}
        onKeyDown={e=>{if(editing===i.id)return;if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();move(i.id,i.day+(e.key==='ArrowRight'?1:-1)*(e.shiftKey?7:1));}else if(e.key==='Enter'){e.preventDefault();setEditing(i.id);}else if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();onRemove(i);}}}>
        <Icon size={13}/>
        {editing===i.id?<input autoFocus defaultValue={i.name} maxLength={120} onBlur={e=>{const v=e.target.value.trim();if(v)setItems(it=>it.map(x=>x.id===i.id?{...x,name:v}:x));setEditing(null);}} onKeyDown={e=>{if(e.key==='Enter')(e.target as HTMLInputElement).blur();if(e.key==='Escape'){setEditing(null);}e.stopPropagation();}}/>
         :<span className="pb-card-text"><strong>{i.name}</strong><small>{fmt(iso,{day:'numeric',month:'short'})}</small></span>}
        <button type="button" className="pb-card-x" aria-label={`Remove ${i.name}`} onClick={()=>onRemove(i)}><Trash2 size={12}/></button>
       </div>;})}
     </div>
    </div>)}
    <div className="pb-marker start" style={{left:LABEL_W}}><span>Start</span></div>
    {end>0&&<div className="pb-marker end" style={{left:LABEL_W+(end+1)*DAY_W}}><span><Flag size={11}/>Deadline · {fmt(addDays(start,end),{day:'numeric',month:'short'})}</span></div>}
   </div>
  </div>
 </div>;
}
