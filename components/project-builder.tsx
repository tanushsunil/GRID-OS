'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import {X,ArrowLeft,ArrowRight,FileText,LayoutTemplate,Clapperboard,Film,Image as ImageIcon,Video,LayoutGrid,Smartphone,Package,CheckCircle2,Plus,Minus,Trash2,Wand2,Flag} from 'lucide-react';
import {today,type Data} from '@/lib/domain';
import {addDays} from '@/lib/extras';
import type {ProjectTemplate} from '@/lib/extras';
import {BUILT_IN_KINDS,syncPlan,defaultTasks,planFromTemplate,planToTemplate,stackRows,autoDay,dueDay,DEFAULT_LENGTH,type Kind,type PlanItem,type Lane} from '@/lib/project-plan';

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
    onReset={()=>setItems(it=>it.map(i=>{if(i.lane==='task')return i;const same=it.filter(x=>x.kind===i.kind);const k=kinds.find(x=>x.id===i.kind)!;const length=DEFAULT_LENGTH[i.kind]??2;return {...i,length,day:Math.max(0,autoDay(k,same.indexOf(i),it)-length+1)};}))}/>
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

/** Drag-and-drop timeline: one column per day, a lane each for shoots, deliverables and tasks.
 *  Drag a card to move it, drag its edges to change when it starts or is due, click it to edit the details. */
type Drag={id:string;mode:'move'|'start'|'end';x:number;orig:{day:number;length:number};cur:{day:number;length:number};moved:boolean};
function Roadmap({items,setItems,start,onRemove,onReset}:{items:PlanItem[];setItems:(f:(i:PlanItem[])=>PlanItem[])=>void;start:string;onRemove:(i:PlanItem)=>void;onReset:()=>void}){
 const scroller=useRef<HTMLDivElement>(null);const [drag,setDrag]=useState<Drag|null>(null);const [selected,setSelected]=useState<string|null>(null);
 const view=drag?items.map(i=>i.id===drag.id?{...i,...drag.cur}:i):items;
 const end=Math.max(...view.map(dueDay),0);const days=Math.max(21,end+SPAN+7);
 const lanes=useMemo(()=>LANES.map(l=>({...l,...stackRows(view.filter(i=>i.lane===l.id),SPAN)})),[view]);
 const update=(id:string,patch:Partial<PlanItem>)=>setItems(it=>it.map(i=>i.id===id?clampItem({...i,...patch}):i));
 const sel=items.find(i=>i.id===selected)||null;

 const onDown=(e:React.PointerEvent,i:PlanItem,mode:Drag['mode'])=>{
  if((e.target as Element).closest('.pb-card-x'))return;e.stopPropagation();
  try{(e.currentTarget as Element).setPointerCapture(e.pointerId);}catch{/* keep dragging without capture */}
  setDrag({id:i.id,mode,x:e.clientX,orig:{day:i.day,length:i.length},cur:{day:i.day,length:i.length},moved:false});
 };
 const onMove=(e:React.PointerEvent)=>{
  if(!drag)return;const d=Math.round((e.clientX-drag.x)/DAY_W);const o=drag.orig;
  const cur=drag.mode==='move'?{day:Math.max(0,o.day+d),length:o.length}
   :drag.mode==='end'?{day:o.day,length:Math.max(1,o.length+d)}
   :{day:Math.min(o.day+o.length-1,Math.max(0,o.day+d)),length:Math.max(1,o.length-(Math.min(o.day+o.length-1,Math.max(0,o.day+d))-o.day))};
  if(cur.day!==drag.cur.day||cur.length!==drag.cur.length||(!drag.moved&&Math.abs(e.clientX-drag.x)>4))setDrag({...drag,cur,moved:drag.moved||Math.abs(e.clientX-drag.x)>4});
  const s=scroller.current;if(s){const r=s.getBoundingClientRect();if(e.clientX>r.right-40)s.scrollLeft+=12;else if(e.clientX<r.left+LABEL_W+30)s.scrollLeft-=12;}
 };
 const onUp=()=>{if(!drag)return;if(drag.moved)update(drag.id,drag.cur);else setSelected(s=>s===drag.id?null:drag.id);setDrag(null);};
 const addTask=()=>{const id=Math.random().toString(36).slice(2,10);setItems(it=>[...it,{id,kind:'task',lane:'task',type:'Task',name:'New task',day:Math.max(1,...it.filter(i=>i.lane==='task').map(dueDay))+1,length:1}]);setSelected(id);};
 const keys=(e:React.KeyboardEvent,i:PlanItem)=>{
  const step=e.shiftKey?7:1;
  if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();const dir=e.key==='ArrowRight'?1:-1;
   if(e.altKey&&i.lane!=='shoot')update(i.id,{length:i.length+dir*step});else update(i.id,{day:i.day+dir*step});}
  else if(e.key==='Enter'){e.preventDefault();setSelected(i.id);}
  else if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();onRemove(i);if(selected===i.id)setSelected(null);}
 };
 return <div className="pb-roadmap">
  <div className="pb-roadmap-bar"><p className="muted">Drag a card to move it · drag its edges to change the start or due date · click it to edit.</p>
   <div className="center-actions"><button type="button" className="button small" onClick={addTask}><Plus size={14}/>Task</button><button type="button" className="button small" onClick={onReset}><Wand2 size={14}/>Auto-arrange</button></div></div>
  <div className="pb-timeline" ref={scroller} style={{['--day' as any]:DAY_W+'px',['--label' as any]:LABEL_W+'px'}}>
   <div className="pb-grid" style={{width:LABEL_W+days*DAY_W}}>
    <div className="pb-days"><div className="pb-corner"/>{Array.from({length:days},(_,d)=>{const iso=addDays(start,d);const dow=new Date(iso+'T12:00:00Z').getUTCDay();return <div key={d} className={`pb-day ${dow===0||dow===6?'weekend':''}`} title={fmt(iso,{weekday:'long',day:'numeric',month:'long'})}>
     {(d===0||iso.endsWith('-01'))&&<span className="pb-month">{fmt(iso,{month:'short'})}</span>}<small>{fmt(iso,{weekday:'narrow'})}</small><b>{Number(iso.slice(8))}</b></div>;})}</div>
    {lanes.map(l=><div key={l.id} className={`pb-lane ${l.id}`} style={{height:l.rows*ROW_H+12}}>
     <div className="pb-lane-label">{l.label}</div>
     <div className="pb-lane-track">
      {Array.from({length:days},(_,d)=>{const dow=new Date(addDays(start,d)+'T12:00:00Z').getUTCDay();return dow===0||dow===6?<span key={d} className="pb-weekend" style={{left:d*DAY_W}}/>:null;})}
      {view.filter(i=>i.lane===l.id).map(i=>{const Icon=ICONS[i.kind]||(i.lane==='task'?CheckCircle2:Package);const width=i.length*DAY_W-4;const roomy=width>=96;
       const when=i.length>1?`${fmt(addDays(start,i.day),{day:'numeric',month:'short'})} – ${fmt(addDays(start,dueDay(i)),{day:'numeric',month:'short'})}`:i.lane==='shoot'&&i.start_time?`${fmt(addDays(start,i.day),{day:'numeric',month:'short'})} · ${i.start_time}`:fmt(addDays(start,i.day),{day:'numeric',month:'short'});
       const resizable=i.lane!=='shoot';
       return <div key={i.id} role="button" tabIndex={0} aria-label={`${i.name}, ${when}${i.length>1?`, ${i.length} days`:''}. Arrow keys move it${resizable?', Alt+arrows change its length':''}; Enter edits.`}
        className={`pb-card ${i.lane} ${drag?.id===i.id?'dragging':''} ${selected===i.id?'selected':''} ${roomy?'':'compact'}`}
        style={{left:i.day*DAY_W+2,top:(l.rowOf.get(i.id)||0)*ROW_H+6,width}}
        onPointerDown={e=>onDown(e,i,'move')} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={()=>setDrag(null)} onKeyDown={e=>keys(e,i)}>
        {resizable&&<span className="pb-handle start" aria-hidden="true" onPointerDown={e=>onDown(e,i,'start')} onPointerMove={onMove} onPointerUp={onUp}/>}
        <Icon size={13}/>
        <span className={`pb-card-text ${roomy?'':'outside'}`}><strong>{i.name}</strong><small>{when}</small></span>
        {roomy&&<button type="button" className="pb-card-x" aria-label={`Remove ${i.name}`} onClick={()=>onRemove(i)}><Trash2 size={12}/></button>}
        {resizable&&<span className="pb-handle end" aria-hidden="true" onPointerDown={e=>onDown(e,i,'end')} onPointerMove={onMove} onPointerUp={onUp}/>}
       </div>;})}
     </div>
    </div>)}
    <div className="pb-marker start" style={{left:LABEL_W}}><span>Start</span></div>
    {end>0&&<div className="pb-marker end" style={{left:LABEL_W+(end+1)*DAY_W}}><span><Flag size={11}/>Deadline · {fmt(addDays(start,end),{day:'numeric',month:'short'})}</span></div>}
   </div>
  </div>
  {sel&&<ItemEditor item={sel} start={start} onChange={p=>update(sel.id,p)} onDelete={()=>{onRemove(sel);setSelected(null);}} onClose={()=>setSelected(null)}/>}
 </div>;
}

/** Keep an item sensible: never before the start, at least a day long, shoots always a single day. */
const clampItem=(i:PlanItem):PlanItem=>({...i,day:Math.max(0,Math.min(365,Math.round(i.day))),length:i.lane==='shoot'?1:Math.max(1,Math.min(120,Math.round(i.length||1)))});
const dayOf=(start:string,iso:string)=>Math.round((Date.parse(iso+'T12:00:00Z')-Date.parse(start+'T12:00:00Z'))/86400000);

/** The details of one roadmap card: name, start, length / due date (and call/wrap times for shoots). */
function ItemEditor({item,start,onChange,onDelete,onClose}:{item:PlanItem;start:string;onChange:(p:Partial<PlanItem>)=>void;onDelete:()=>void;onClose:()=>void}){
 const startIso=addDays(start,item.day),dueIso=addDays(start,dueDay(item));const shoot=item.lane==='shoot';
 return <div className="pb-editor" role="group" aria-label={`Edit ${item.name}`}>
  <div className="pb-editor-head"><strong>{shoot?'Shoot':item.lane==='task'?'Task':'Deliverable'}</strong><button type="button" className="icon-button" aria-label="Close editor" onClick={onClose}><X size={16}/></button></div>
  <div className="pb-editor-grid">
   <label className="wide">Name<input value={item.name} maxLength={120} onChange={e=>onChange({name:e.target.value})} onBlur={e=>{if(!e.target.value.trim())onChange({name:'Untitled'});}}/></label>
   <label>{shoot?'Date':'Starts'}<input type="date" value={startIso} min={start} onChange={e=>{if(e.target.value)onChange({day:dayOf(start,e.target.value)});}}/></label>
   {shoot?<>
    <label>Call time<input type="time" value={item.start_time||'09:00'} onChange={e=>onChange({start_time:e.target.value})}/></label>
    <label>Wrap time<input type="time" value={item.end_time||'17:00'} onChange={e=>onChange({end_time:e.target.value})}/></label>
   </>:<>
    <label>Days<input type="number" min={1} max={120} value={item.length} onChange={e=>onChange({length:Number(e.target.value)||1})}/></label>
    <label>Due<input type="date" value={dueIso} min={startIso} onChange={e=>{if(e.target.value)onChange({length:dayOf(start,e.target.value)-item.day+1});}}/></label>
   </>}
  </div>
  <div className="pb-editor-foot"><button type="button" className="button small" onClick={onDelete}><Trash2 size={13}/>Remove</button><button type="button" className="button small primary" onClick={onClose}>Done</button></div>
 </div>;
}
