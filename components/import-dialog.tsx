'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import {X,Upload,FileSpreadsheet,Download,AlertTriangle,CheckCircle2,Info,Loader2,ArrowLeft} from 'lucide-react';
import {columns,autoMap,planImport,templateTable,type ImportKind,type ImportPlan} from '@/lib/import';
import {readTable,toCsv,toXlsx,type Table} from '@/lib/tabular';
import {downloadFile} from '@/lib/extras';
import {money,type Data} from '@/lib/domain';

const NOUN:Record<ImportKind,[string,string]>={clients:['client','clients'],leads:['lead','leads'],invoices:['invoice','invoices']};
const plural=(n:number,kind:ImportKind)=>`${n} ${NOUN[kind][n===1?0:1]}`;

/** Import clients, leads or invoices from a CSV or Excel file: pick a file → check the columns → preview → import. */
export default function ImportDialog({kind,data,onImport,onClose}:{kind:ImportKind;data:Data;onImport:(plan:ImportPlan)=>Promise<string>;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null);const input=useRef<HTMLInputElement>(null);
 const [table,setTable]=useState<Table|null>(null);const [fileName,setFileName]=useState('');
 const [map,setMap]=useState<Record<string,number|null>>({});const [monthFirst,setMonthFirst]=useState(false);
 const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [done,setDone]=useState('');const [dragging,setDragging]=useState(false);
 useEffect(()=>{dialog.current?.showModal();},[]);
 const plan=useMemo(()=>table?planImport(kind,table.rows,map,data,{monthFirst}):null,[table,map,data,monthFirst,kind]);
 const close=()=>{if(!busy)onClose();};

 async function choose(file?:File|null){
  if(!file)return;setError('');setBusy(true);
  try{const t=await readTable(file);setTable(t);setFileName(file.name);setMap(autoMap(kind,t.headers));}
  catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 async function template(format:'csv'|'xlsx'){
  const t=templateTable(kind);const name=`grid-os-${kind}-template.${format}`;
  if(format==='csv')downloadFile(name,toCsv(t.headers,t.rows),'text/csv;charset=utf-8');
  else downloadFile(name,await toXlsx(t.headers,t.rows,NOUN[kind][1]),'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
 }
 async function run(){
  if(!plan?.ready.length)return;setBusy(true);setError('');
  try{setDone(await onImport(plan));}catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }

 const sample=(i:number|null)=>{if(i==null||!table)return '';const v=table.rows.find(r=>r[i]!=null&&String(r[i]).trim()!=='')?.[i];return v instanceof Date?v.toISOString().slice(0,10):String(v??'').slice(0,40);};
 const blocking=plan?.problems.filter(p=>p.row===0)||[];
 const rowProblems=plan?.problems.filter(p=>p.row>0)||[];

 return <dialog ref={dialog} className="modal wide import-dialog" onCancel={e=>{e.preventDefault();close();}}>
  <div className="modal-head"><div><span className="eyebrow">IMPORT</span><h2>Import {NOUN[kind][1]}</h2></div><button type="button" className="icon-button" aria-label="Close" disabled={busy} onClick={close}><X size={20}/></button></div>
  <div className="modal-content">
   {done?<div className="import-done" role="status"><CheckCircle2 size={34}/><h3>Import complete</h3><p>{done}</p></div>
   :!table?<>
    <label className={`import-drop ${dragging?'over':''}`} onDragOver={e=>{e.preventDefault();setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={e=>{e.preventDefault();setDragging(false);choose(e.dataTransfer.files?.[0]);}}>
     {busy?<Loader2 size={28} className="auth-spin"/>:<Upload size={28}/>}
     <strong>{busy?'Reading file…':'Choose a CSV or Excel file'}</strong>
     <small>or drag it here · .csv or .xlsx · up to 5,000 rows</small>
     <input ref={input} type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={e=>{choose(e.target.files?.[0]);e.target.value='';}}/>
    </label>
    {error&&<p className="notice error" role="alert"><AlertTriangle size={15}/>{error}</p>}
    <div className="import-help">
     <p><Info size={14}/>The first row should be column headings. GRID OS matches them automatically, and you can adjust the matches before anything is saved.</p>
     {kind==='invoices'&&<p><Info size={14}/>Use one row per invoice with an <b>Amount</b>, or one row per line item with <b>Service</b>, <b>Quantity</b> and <b>Rate</b> (rows sharing an invoice number are combined). Missing clients and projects are created for you, and <b>Paid</b> or <b>Amount paid</b> records the payment.</p>}
     <div className="import-template"><span>Start from a template:</span><button type="button" className="button small" onClick={()=>template('csv')}><Download size={14}/>CSV</button><button type="button" className="button small" onClick={()=>template('xlsx')}><Download size={14}/>Excel</button></div>
    </div>
   </>:<>
    <div className="import-file"><FileSpreadsheet size={18}/><span><strong>{fileName}</strong><small>{table.rows.length} rows · {table.headers.length} columns</small></span><button type="button" className="link-button" disabled={busy} onClick={()=>{setTable(null);setError('');}}><ArrowLeft size={14}/>Choose another file</button></div>

    <h3 className="import-step">1. Check the columns</h3>
    <div className="import-map">
     {columns[kind].map(c=><label key={c.key} className="import-map-row" title={c.hint}>
      <span className="import-map-field">{c.label}{c.required&&<b aria-label="required"> *</b>}</span>
      <select value={map[c.key]??''} onChange={e=>setMap(m=>({...m,[c.key]:e.target.value===''?null:Number(e.target.value)}))}>
       <option value="">— Not in this file —</option>
       {table.headers.map((h,i)=><option key={i} value={i}>{h}</option>)}
      </select>
      <small className="import-sample">{sample(map[c.key]??null)}</small>
     </label>)}
    </div>
    {columns[kind].some(c=>c.type==='date'&&map[c.key]!=null)&&<label className="import-option"><span>Dates like 03/04/2025 are</span><select value={monthFirst?'mdy':'dmy'} onChange={e=>setMonthFirst(e.target.value==='mdy')}><option value="dmy">day / month / year</option><option value="mdy">month / day / year</option></select></label>}

    <h3 className="import-step">2. Preview</h3>
    {blocking.length?<p className="notice error" role="alert"><AlertTriangle size={15}/>{blocking.map(p=>p.message).join(' ')}</p>:plan&&<>
     <div className="import-summary">
      <div className="ok"><strong>{plan.ready.length}</strong><span>ready to import</span></div>
      <div><strong>{plan.skipped.length}</strong><span>already in GRID OS</span></div>
      <div className={rowProblems.length?'bad':''}><strong>{rowProblems.length}</strong><span>need fixing</span></div>
     </div>
     {kind==='invoices'&&(plan.newClients.length>0||plan.newProjects.length>0)&&<p className="notice info"><Info size={15}/>Will also create {plan.newClients.length>0&&<>{plural(plan.newClients.length,'clients')}{plan.newProjects.length>0&&' and '}</>}{plan.newProjects.length>0&&`${plan.newProjects.length} project${plan.newProjects.length===1?'':'s'}`}.</p>}
     {rowProblems.length>0&&<details className="import-issues" open={plan.ready.length===0}><summary>{rowProblems.length} row{rowProblems.length===1?'':'s'} won’t be imported — show why</summary><ul>{rowProblems.slice(0,100).map((p,i)=><li key={i}><b>Row {p.row}:</b> {p.message}</li>)}{rowProblems.length>100&&<li>…and {rowProblems.length-100} more</li>}</ul></details>}
     {plan.skipped.length>0&&<details className="import-issues"><summary>{plan.skipped.length} already exist and will be skipped</summary><ul>{plan.skipped.slice(0,100).map((p,i)=><li key={i}><b>Row {p.row}:</b> {p.message}</li>)}</ul></details>}
     {plan.ready.length>0&&<div className="table-wrap import-preview"><table><thead><tr>{kind==='invoices'?<><th>Invoice</th><th>Client</th><th>Issued</th><th>Status</th><th>Total</th></>:columns[kind].slice(0,4).map(c=><th key={c.key}>{c.label}</th>)}</tr></thead>
      <tbody>{plan.ready.slice(0,6).map((r,i)=><tr key={i}>{kind==='invoices'?<><td>{r.number||'New number'}<small> · {r.items.length} item{r.items.length===1?'':'s'}</small></td><td>{r.client}</td><td>{r.issue_date}</td><td>{r.amount_paid>=r.total&&r.total>0?'Paid':r.amount_paid>0?'Partially paid':r.status}</td><td>{money(r.total)}</td></>:columns[kind].slice(0,4).map(c=><td key={c.key}>{String(r[c.key]??'')}</td>)}</tr>)}</tbody></table>
      {plan.ready.length>6&&<small className="muted">…and {plan.ready.length-6} more</small>}</div>}
    </>}
    {error&&<p className="notice error" role="alert"><AlertTriangle size={15}/>{error}</p>}
   </>}
  </div>
  <div className="modal-footer">
   {done?<button type="button" className="button primary" onClick={onClose}>Done</button>:<>
    <button type="button" className="button" disabled={busy} onClick={close}>Cancel</button>
    {table&&<button type="button" className="button primary" disabled={busy||!plan?.ready.length} onClick={run}>{busy?<><Loader2 size={15} className="auth-spin"/>Importing…</>:`Import ${plural(plan?.ready.length||0,kind)}`}</button>}
   </>}
  </div>
 </dialog>;
}
