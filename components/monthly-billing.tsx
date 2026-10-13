'use client';
import {useState} from 'react';
import {Plus,Trash2,CalendarClock,Pause,Play,Pencil,Repeat} from 'lucide-react';
import {money,displayDate,totals,blankItem,type Item,type Row} from '@/lib/domain';
import {nextRun,billedPeriods,periodLabel,periodOf,DEFAULT_BILLING_DAY,type BillingSchedule} from '@/lib/billing';

type Draft=Omit<BillingSchedule,'id'|'client_id'|'project_id'>&{id?:string};
const ordinal=(n:number)=>`${n}${n%10===1&&n!==11?'st':n%10===2&&n!==12?'nd':n%10===3&&n!==13?'rd':'th'}`;

/** Project → Finance → "Monthly invoicing": a draft invoice is prepared on the chosen day each month. */
export default function MonthlyBilling({project,schedule,invoices,estimateItems,today,canEdit,onSave,onRemove}:{project:Row;schedule?:BillingSchedule;invoices:Row[];estimateItems?:Item[];today:string;canEdit:boolean;onSave:(s:Draft)=>Promise<void>;onRemove:()=>Promise<void>}){
 const fresh=():Draft=>({items:(estimateItems?.length?estimateItems:[blankItem()]).map(({service,description,quantity,unit,rate,tax})=>({service,description:description||'',quantity,unit:unit||'',rate,tax})),discount:0,payment_terms:'',notes:'',day:DEFAULT_BILLING_DAY,due_days:7,starts_on:periodOf(today),ends_on:null,active:true});
 const [draft,setDraft]=useState<Draft|null>(null);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 const set=<K extends keyof Draft>(k:K,v:Draft[K])=>setDraft(d=>d&&{...d,[k]:v});
 const setItem=(i:number,patch:Partial<Item>)=>setDraft(d=>d&&{...d,items:d.items.map((it,j)=>j===i?{...it,...patch}:it)});
 const save=async(next:Draft)=>{setBusy(true);setError('');try{await onSave(next);setDraft(null);}catch(e){setError((e as Error).message);}finally{setBusy(false);}};

 if(draft){
  const sums=totals(draft.items,draft.discount);
  return <form className="settings-form billing-form" onSubmit={e=>{e.preventDefault();if(draft.items.some(i=>!i.service.trim()))return setError('Give every line a service name.');save(draft);}}>
   <section className="line-editor"><div className="section-heading"><h3>Billed every month</h3><button type="button" className="button small" onClick={()=>set('items',[...draft.items,blankItem()])}><Plus size={14}/>Add item</button></div>
    {draft.items.map((item,i)=><div className="line-item" key={i}>
     <label>Service<input aria-label={`Service ${i+1}`} required value={item.service} onChange={e=>setItem(i,{service:e.target.value})}/></label>
     <label>Unit<input aria-label={`Unit ${i+1}`} placeholder="e.g. Reel" value={item.unit||''} onChange={e=>setItem(i,{unit:e.target.value})}/></label>
     {(['quantity','rate','tax'] as const).map(k=><label key={k}>{k==='quantity'?'Qty':k==='rate'?'Rate ₹':'Tax %'}<input aria-label={`${k} ${i+1}`} type="number" min={k==='quantity'?'0.001':'0'} max={k==='tax'?100:undefined} step="any" required value={item[k]} onChange={e=>setItem(i,{[k]:Number(e.target.value)})}/></label>)}
     <button type="button" aria-label={`Remove item ${i+1}`} className="icon-button" disabled={draft.items.length===1} onClick={()=>set('items',draft.items.filter((_,j)=>j!==i))}><Trash2 size={16}/></button>
    </div>)}
    <div className="totals"><p>Subtotal <b>{money(sums.subtotal)}</b></p><label className="billing-discount">Discount ₹<input type="number" min="0" step="any" value={draft.discount} onChange={e=>set('discount',Number(e.target.value))}/></label><p>Tax <b>{money(sums.tax)}</b></p><p className="grand">Every month <b>{money(sums.total)}</b></p></div>
   </section>
   <div className="form-grid">
    <label>Prepare the invoice on the<select value={draft.day} onChange={e=>set('day',Number(e.target.value))}>{Array.from({length:31},(_,i)=>i+1).map(d=><option key={d} value={d}>{ordinal(d)}{d>28?' (or the last day of shorter months)':''}</option>)}</select></label>
    <label>Payment due<select value={draft.due_days} onChange={e=>set('due_days',Number(e.target.value))}>{[0,7,10,15,30,45].map(d=><option key={d} value={d}>{d===0?'On the invoice date':`${d} days after`}</option>)}</select></label>
    <label>First month<input type="month" required value={draft.starts_on} onChange={e=>set('starts_on',e.target.value)}/></label>
    <label>Last month <small className="muted">(optional)</small><input type="month" min={draft.starts_on} value={draft.ends_on||''} onChange={e=>set('ends_on',e.target.value||null)}/></label>
   </div>
   <label>Payment terms<textarea value={draft.payment_terms||''} placeholder="e.g. Payable within 7 days by bank transfer." onChange={e=>set('payment_terms',e.target.value)}/></label>
   {error&&<p className="notice error" role="alert">{error}</p>}
   <div className="center-actions" style={{justifyContent:'flex-start'}}><button className="button primary" disabled={busy}>{busy?'Saving…':schedule?'Save changes':'Start monthly invoicing'}</button><button type="button" className="button" disabled={busy} onClick={()=>{setDraft(null);setError('');}}>Cancel</button></div>
  </form>;
 }

 if(!schedule)return <div className="settings-form">
  <p className="muted">For retainers and monthly content: GRID OS prepares this project’s invoice as a draft on the {ordinal(DEFAULT_BILLING_DAY)} of every month, ready for you to check and send.</p>
  {canEdit&&<div><button className="button primary" onClick={()=>setDraft(fresh())}><Repeat size={15}/>Set up monthly invoicing</button></div>}
 </div>;

 const done=billedPeriods(invoices,schedule.id,schedule.skipped);const next=nextRun(schedule,today,done);const monthly=totals(schedule.items,schedule.discount).total;
 return <div className="settings-form">
  <div className="billing-summary">
   <span className="billing-icon"><CalendarClock size={18}/></span>
   <div><strong>{money(monthly)} every month</strong><small>Prepared on the {ordinal(schedule.day)}{schedule.day>28?' (last day in shorter months)':''} · due {schedule.due_days?`${schedule.due_days} days later`:'the same day'} · from {periodLabel(schedule.starts_on)}{schedule.ends_on?` to ${periodLabel(schedule.ends_on)}`:''}</small></div>
   <span className={`badge ${schedule.active?'':'muted'}`}>{schedule.active?'Active':'Paused'}</span>
  </div>
  <p className="muted">{!schedule.active?'Paused — no invoices will be prepared until you resume.':next?<>Next invoice: <b>{displayDate(next.date)}</b> for {periodLabel(next.period)}. It’ll appear under Invoices as a draft.</>:'This schedule has finished.'}{done.size>0&&` ${done.size} monthly invoice${done.size===1?'':'s'} prepared so far.`}</p>
  {error&&<p className="notice error" role="alert">{error}</p>}
  {canEdit&&<div className="center-actions" style={{justifyContent:'flex-start'}}>
   <button className="button" disabled={busy} onClick={()=>setDraft({...schedule})}><Pencil size={14}/>Edit</button>
   <button className="button" disabled={busy} onClick={()=>save({...schedule,active:!schedule.active})}>{schedule.active?<><Pause size={14}/>Pause</>:<><Play size={14}/>Resume</>}</button>
   <button className="button" disabled={busy} onClick={async()=>{if(!confirm('Stop monthly invoicing for this project? Invoices already prepared stay as they are.'))return;setBusy(true);try{await onRemove();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>Stop</button>
  </div>}
 </div>;
}
