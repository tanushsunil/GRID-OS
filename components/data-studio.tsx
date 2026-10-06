'use client';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import Link from 'next/link';
import {Table2,BarChart3,Download,X,ArrowUp,ArrowDown,ArrowUpDown,Filter,SlidersHorizontal} from 'lucide-react';
import {invoiceStates,money,rentalCost,rentalDays,totals,statuses,displayDate,type Data,type Row} from '@/lib/domain';
import {addDays,downloadFile} from '@/lib/extras';

/* ---------- shared helpers ---------- */
type Tip={x:number;y:number;title:string;rows:[string,string,string][]}|null;
const compact=(n:number)=>{const a=Math.abs(n);const s=n<0?'-':'';return a>=10000000?`${s}₹${(a/10000000).toFixed(1)}Cr`:a>=100000?`${s}₹${(a/100000).toFixed(1)}L`:a>=1000?`${s}₹${Math.round(a/1000)}k`:`${s}₹${Math.round(a)}`;};
const pct=(n:number)=>`${Math.round(n*100)}%`;
const sum=(rows:Row[],f:(r:Row)=>number)=>rows.reduce((a,r)=>a+(f(r)||0),0);
const monthLabel=(m:string)=>new Date(m+'-01T12:00:00Z').toLocaleDateString('en-IN',{month:'short',year:'2-digit',timeZone:'UTC'});
const monthsBack=(current:string,n:number)=>Array.from({length:n},(_,i)=>{const d=new Date(current.slice(0,7)+'-01T12:00:00Z');d.setUTCMonth(d.getUTCMonth()-(n-1)+i);return d.toISOString().slice(0,7);});
const niceTop=(v:number)=>{if(v<=0)return 1;const step=Math.pow(10,Math.floor(Math.log10(v)));return Math.ceil(v/step)*step;};

function useTip(){
 const setter=useRef<(t:Tip)=>void>(()=>{});
 const show=useCallback((e:React.PointerEvent|React.FocusEvent,title:string,rows:[string,string,string][])=>{const b=(e.currentTarget as HTMLElement).getBoundingClientRect();setter.current({x:b.left+b.width/2,y:b.top,title,rows});},[]);
 const hide=useCallback(()=>setter.current(null),[]);
 return {tip:setter,show,hide};
}
function TipBox({tip:setter}:{tip:React.MutableRefObject<(t:Tip)=>void>}){const [tip,setTip]=useState<Tip>(null);useEffect(()=>{setter.current=setTip;return()=>{setter.current=()=>{};};},[setter]);if(!tip)return null;return <div className="viz-tooltip" style={{left:tip.x,top:tip.y}} role="status"><b>{tip.title}</b>{tip.rows.map(([cls,label,value])=><span key={label}>{cls&&<i className={'line-key '+cls}/>}<strong>{value}</strong>{label}</span>)}</div>;}

type BarItem={key:string;label:string;value:number;display:string;active?:boolean;onClick?:()=>void;extra?:[string,string,string][]};
function HBars({items,series,empty,show,hide}:{items:BarItem[];series:string;empty:string;show:ReturnType<typeof useTip>['show'];hide:()=>void}){
 if(!items.length)return <p className="prose muted ds-empty">{empty}</p>;
 const peak=Math.max(1,...items.map(i=>Math.abs(i.value)));
 return <div className="hbar-list ds-hbars">{items.map(i=>{const Tag:any=i.onClick?'button':'div';const rows:[string,string,string][]=[[series,i.label,i.display],...(i.extra||[])];
  return <Tag key={i.key} type={i.onClick?'button':undefined} className={`hbar ${i.active?'active':''} ${i.onClick?'clickable':''}`} onClick={i.onClick} aria-pressed={i.onClick?!!i.active:undefined} onPointerEnter={(e:any)=>show(e,i.label,rows)} onPointerLeave={hide} onFocus={(e:any)=>show(e,i.label,rows)} onBlur={hide}>
   <span className="hbar-name">{i.label}</span><span className="hbar-track"><i className={`bar ${i.value<0?'negative':series}`} style={{width:`${Math.abs(i.value)/peak*100}%`}}/></span><span className="hbar-value">{i.display}</span>
  </Tag>;})}</div>;
}

/* ---------- Report ---------- */
type Filters={period:string;client:string;status:string;category:string};
const periods:[string,string][]=[['30d','Last 30 days'],['90d','Last 90 days'],['6m','Last 6 months'],['12m','Last 12 months'],['all','All time']];

export function DataReport({data,current,nameOf,members}:{data:Data;current:string;nameOf:(id?:string)=>string;members:any[]}){
 const [f,setF]=useState<Filters>({period:'90d',client:'',status:'',category:''});const [table,setTable]=useState(false);const {tip,show,hide}=useTip();
 const set=(patch:Partial<Filters>)=>setF(o=>({...o,...patch}));const toggle=(k:keyof Filters,v:string)=>setF(o=>({...o,[k]:o[k]===v?'':v}));
 const days=f.period==='30d'?30:f.period==='90d'?90:f.period==='6m'?182:f.period==='12m'?365:0;
 const start=days?addDays(current,-days+1):'0000-01-01';const prevStart=days?addDays(current,-2*days+1):'';const prevEnd=days?addDays(current,-days):'';
 const inRange=(d:string|undefined,a:string,b:string)=>!!d&&d.slice(0,10)>=a&&d.slice(0,10)<=b;
 const projectOf=(r:Row)=>projectsById.get(r.project_id);
 const clientOfProject=(r:Row)=>projectOf(r)?.client_id;
 const projects=data.projects.filter(p=>(!f.client||p.client_id===f.client)&&(!f.status||p.status===f.status));
 const projectIds=new Set(projects.map(p=>p.id));
 const issued=data.invoices.filter(i=>!['Draft','Cancelled'].includes(i.status)&&(!f.client||i.client_id===f.client)&&(!f.status||projectIds.has(i.project_id)));
 const states=useMemo(()=>invoiceStates(data,current),[data,current]);const st=(i:Row)=>states.get(i.id)!;
 const invoicesById=useMemo(()=>new Map(data.invoices.map(i=>[i.id,i])),[data]);const projectsById=useMemo(()=>new Map(data.projects.map(p=>[p.id,p])),[data]);const invoiceClient=(id:string)=>invoicesById.get(id);
 const payments=data.payments.filter(p=>{const inv=invoiceClient(p.invoice_id);return inv&&(!f.client||inv.client_id===f.client)&&(!f.status||projectIds.has(inv.project_id));});
 const rentals=data.rentals.filter(r=>r.status!=='Cancelled'&&(!f.client||clientOfProject(r)===f.client)&&(!f.status||projectIds.has(r.project_id))&&(!f.category||r.category===f.category));
 // Rentals count when booked for: pickup date, else when the booking was made. Upcoming bookings are committed spend.
 const rentalDate=(r:Row)=>r.start_date||r.created_at||r.updated_at;
 const windowSums=(a:string,b:string)=>({invoiced:sum(issued.filter(i=>inRange(i.issue_date,a,b)),i=>st(i).total),collected:sum(payments.filter(p=>inRange(p.date,a,b)),p=>Number(p.amount)),expenses:sum(rentals.filter(r=>inRange(rentalDate(r),a,b===current?'9999-12-31':b)),rentalCost)});
 const now=windowSums(start,current);const prev=days?windowSums(prevStart,prevEnd):null;
 const outstanding=sum(issued,i=>Math.max(0,st(i).balance));
 const projectCosts=sum(projects.filter(p=>p.cost!==undefined&&p.cost!==null&&p.cost!==''),p=>Number(p.cost));
 const profit=now.invoiced-now.expenses-(f.period==='all'?projectCosts:0);
 const active=projects.filter(p=>!['Completed','Delivered','On Hold'].includes(p.status)).length;
 const delta=(a:number,b?:number)=>b===undefined||prev===null?null:b===0?(a>0?Infinity:null):(a-b)/b;
 const kpis:[string,string,number|null,string,boolean][]=[
  ['Invoiced',money(now.invoiced),delta(now.invoiced,prev?.invoiced),'up',true],
  ['Collected',money(now.collected),delta(now.collected,prev?.collected),'up',true],
  ['Outstanding',money(outstanding),null,'',true],
  ['Shoot expenses',money(now.expenses),delta(now.expenses,prev?.expenses),'down',true],
  [f.period==='all'?'Profit':'Profit (rentals only)',money(profit),null,'',profit>=0],
  ['Active projects',String(active),null,'',true],
 ];
 // monthly trend
 const n=f.period==='30d'||f.period==='90d'?3:f.period==='6m'?6:12;
 const months=f.period==='all'?(()=>{const dates=[...issued.map(i=>i.issue_date),...payments.map(p=>p.date),...rentals.map(rentalDate)].filter(Boolean).map((d:string)=>d.slice(0,7)).sort();const first=dates[0]||current.slice(0,7);const span=Math.min(24,Math.max(1,(Number(current.slice(0,4))-Number(first.slice(0,4)))*12+Number(current.slice(5,7))-Number(first.slice(5,7))+1));return monthsBack(current,span);})():monthsBack(current,n);
 const trend=months.map(m=>({m,invoiced:sum(issued.filter(i=>i.issue_date?.startsWith(m)),i=>st(i).total),collected:sum(payments.filter(p=>p.date?.startsWith(m)),p=>Number(p.amount)),expenses:sum(rentals.filter(r=>rentalDate(r)?.startsWith(m)),rentalCost)}));
 const top=niceTop(Math.max(0,...trend.flatMap(t=>[t.invoiced,t.collected,t.expenses])));
 // breakdowns
 const byClient=data.clients.map(c=>({c,v:sum(issued.filter(i=>i.client_id===c.id&&inRange(i.issue_date,start,current)),i=>st(i).total)})).filter(x=>x.v>0||f.client===x.c.id).sort((a,b)=>b.v-a.v).slice(0,8);
 const categories=[...new Set(data.rentals.map(r=>r.category||'Other'))];
 const byCategory=categories.map(c=>({c,v:sum(rentals.filter(r=>(r.category||'Other')===c&&inRange(rentalDate(r),start,'9999-12-31')),rentalCost)})).filter(x=>x.v>0||f.category===x.c).sort((a,b)=>b.v-a.v);
 const byStatus=statuses.projects.map(s=>({s,v:data.projects.filter(p=>p.status===s&&(!f.client||p.client_id===f.client)).length})).filter(x=>x.v>0);
 const workload=members.map((m:any)=>({id:m.user_id,v:data.tasks.filter(t=>t.assignee_id===m.user_id&&t.status!=='Done'&&projectIds.has(t.project_id)).length+data.deliverables.filter(d=>d.assignee_id===m.user_id&&!['Approved','Delivered'].includes(d.status)&&projectIds.has(d.project_id)).length})).filter((x:any)=>x.v>0).sort((a:any,b:any)=>b.v-a.v);
 const profitRows=projects.map(p=>{const inv=issued.filter(i=>i.project_id===p.id);const revenue=sum(inv,i=>st(i).total);const rent=sum(data.rentals.filter(r=>r.project_id===p.id&&r.status!=='Cancelled'),rentalCost);const cost=Number(p.cost)||0;return {p,revenue,rent,cost,profit:revenue-rent-cost,margin:revenue?(revenue-rent-cost)/revenue:null};}).filter(x=>x.revenue||x.rent||x.cost).sort((a,b)=>b.profit-a.profit);
 const chips:[keyof Filters,string][]=([['client',data.clients.find(c=>c.id===f.client)?.name||''],['status',f.status],['category',f.category]] as [keyof Filters,string][]).filter(([,v])=>v);
 const series:[keyof typeof trend[0],string,string][]=[['invoiced','Invoiced','series-1'],['collected','Collected','series-2'],['expenses','Shoot expenses','series-3']];

 return <div className="ds">
  <div className="ds-filters" role="toolbar" aria-label="Report filters">
   <span className="ds-filter-label"><SlidersHorizontal size={14}/>Filters</span>
   <select aria-label="Period" value={f.period} onChange={e=>set({period:e.target.value})}>{periods.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>
   <select aria-label="Client" value={f.client} onChange={e=>set({client:e.target.value})}><option value="">All clients</option>{data.clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>
   <select aria-label="Project status" value={f.status} onChange={e=>set({status:e.target.value})}><option value="">All project statuses</option>{statuses.projects.map(s=><option key={s}>{s}</option>)}</select>
   <select aria-label="Rental category" value={f.category} onChange={e=>set({category:e.target.value})}><option value="">All gear categories</option>{categories.map(c=><option key={c}>{c}</option>)}</select>
   {chips.length>0&&<div className="ds-chips">{chips.map(([k,v])=><button key={k} className="ds-chip" onClick={()=>set({[k]:''} as any)}><Filter size={11}/>{v}<X size={12}/></button>)}<button className="link-button" onClick={()=>setF(o=>({...o,client:'',status:'',category:''}))}>Clear all</button></div>}
  </div>
  <p className="ds-hint">Tip: click a bar in any chart to filter the whole report by it.</p>
  <div className="ds-kpis">{kpis.map(([label,value,d,good,ok])=><div className="kpi ds-kpi" key={label}><span>{label}</span><strong className={ok?'':'red-text'}>{value}</strong>{d===null?<small>{label==='Outstanding'?'Across all open invoices':label==='Active projects'?'Not completed or on hold':days?`${periods.find(p=>p[0]===f.period)?.[1]}`:'All time'}</small>:d===Infinity?<small>Nothing in the previous {days} days</small>:<small className={`ds-delta ${(d>=0)===(good==='up')?'good':'bad'}`}>{d>=0?<ArrowUp size={11}/>:<ArrowDown size={11}/>}{pct(Math.abs(d))} vs previous {days} days</small>}</div>)}</div>
  <div className="ds-grid">
   <section className="panel ds-wide"><div className="panel-heading"><h2>Money in vs money out</h2><button className="button small" aria-pressed={table} onClick={()=>setTable(t=>!t)}>{table?<BarChart3 size={14}/>:<Table2 size={14}/>}{table?'Chart':'Table'}</button></div>
    <div className="viz-root">
     <div className="viz-legend">{series.map(([,l,c])=><span key={l}><i className={'key '+c}/>{l}</span>)}<small>By month</small></div>
     {table?<div className="table-wrap"><table><thead><tr><th>Month</th>{series.map(([,l])=><th key={l}>{l}</th>)}</tr></thead><tbody>{trend.map(t=><tr key={t.m}><td>{monthLabel(t.m)}</td><td>{money(t.invoiced)}</td><td>{money(t.collected)}</td><td>{money(t.expenses)}</td></tr>)}</tbody></table></div>
     :<div className="bar-chart" role="img" aria-label={`Monthly invoiced, collected and shoot expenses: ${trend.map(t=>`${monthLabel(t.m)} ${money(t.invoiced)}, ${money(t.collected)}, ${money(t.expenses)}`).join('; ')}`}>
      <div className="bar-axis">{[top,top/2,0].map(t=><span key={t}>{compact(t)}</span>)}</div>
      <div className="bar-plot"><div className="bar-grid">{[0,1,2].map(i=><i key={i}/>)}</div>
       {trend.map(t=>{const rows:[string,string,string][]=series.map(([k,l,c])=>[c,l,money(t[k] as number)]);return <div className="bar-group" key={t.m} tabIndex={0} onPointerEnter={e=>show(e,monthLabel(t.m),rows)} onPointerLeave={hide} onFocus={e=>show(e,monthLabel(t.m),rows)} onBlur={hide}>
        <div className="bars">{series.map(([k,,c])=><i key={c} className={'bar '+c} style={{height:`${(t[k] as number)/top*100}%`}}/>)}</div><span className="bar-label">{monthLabel(t.m)}</span></div>;})}
      </div></div>}
    </div></section>
   <section className="panel"><div className="panel-heading"><h2>Invoiced by client</h2></div><div className="viz-root"><HBars series="series-1" show={show} hide={hide} empty="No invoices in this period." items={byClient.map(x=>({key:x.c.id,label:x.c.name,value:x.v,display:compact(x.v),active:f.client===x.c.id,onClick:()=>toggle('client',x.c.id),extra:[['','Share',now.invoiced?pct(x.v/now.invoiced):'—']]}))}/></div></section>
   <section className="panel"><div className="panel-heading"><h2>Rental spend by category</h2></div><div className="viz-root"><HBars series="series-3" show={show} hide={hide} empty="No rental spend in this period." items={byCategory.map(x=>({key:x.c,label:x.c,value:x.v,display:compact(x.v),active:f.category===x.c,onClick:()=>toggle('category',x.c)}))}/></div></section>
   <section className="panel"><div className="panel-heading"><h2>Projects by status</h2></div><div className="viz-root"><HBars series="series-neutral" show={show} hide={hide} empty="No projects match these filters." items={byStatus.map(x=>({key:x.s,label:x.s,value:x.v,display:String(x.v),active:f.status===x.s,onClick:()=>toggle('status',x.s)}))}/></div></section>
   <section className="panel"><div className="panel-heading"><h2>Team workload</h2></div><div className="viz-root"><HBars series="series-neutral" show={show} hide={hide} empty="No open tasks or deliverables." items={workload.map((x:any)=>({key:x.id,label:nameOf(x.id),value:x.v,display:`${x.v} open`}))}/></div></section>
  </div>
  <section className="panel"><div className="panel-heading"><h2>Profit by project</h2><small className="muted">Invoiced − rentals − production cost · all time</small></div>
   {profitRows.length?<div className="table-wrap"><table className="profit-table"><thead><tr><th>Project</th><th>Invoiced</th><th>Rentals</th><th>Production cost</th><th>Profit</th><th>Margin</th></tr></thead><tbody>{profitRows.map(x=><tr key={x.p.id}><td><Link className="row-title" href={'/projects/'+x.p.id}>{x.p.name}</Link><span className="row-meta">{data.clients.find(c=>c.id===x.p.client_id)?.name} · {x.p.status}</span></td><td>{money(x.revenue)}</td><td>{money(x.rent)}</td><td>{x.cost?money(x.cost):'—'}</td><td className={x.profit<0?'red-text':''}>{money(x.profit)}</td><td>{x.margin===null?'—':<span className="margin-cell"><span className="margin-track"><i style={{width:`${Math.max(0,Math.min(1,x.margin))*100}%`}} className={x.margin<0.2?'low':''}/></span>{pct(x.margin)}</span>}</td></tr>)}</tbody></table></div>:<p className="prose muted ds-empty">No invoiced or costed projects match these filters.</p>}
  </section>
  <TipBox tip={tip}/>
 </div>;
}

/* ---------- Explore ---------- */
type Col={key:string;label:string;kind:'text'|'number'|'money'|'date';get:(r:Row)=>any};
type Dataset={label:string;rows:Row[];cols:Col[]};
export function buildDatasets(data:Data,current:string,nameOf:(id?:string)=>string):Record<string,Dataset>{
 const projects=new Map(data.projects.map(p=>[p.id,p]));const clients=new Map(data.clients.map(c=>[c.id,c.name]));const shoots=new Map(data.shoots.map(x=>[x.id,x.name]));const invoices=new Map(data.invoices.map(i=>[i.id,i]));
 const project=(id?:string)=>id?projects.get(id):undefined;const client=(id?:string)=>(id&&clients.get(id))||'';
 const states=invoiceStates(data,current);const st=(i:Row)=>states.get(i.id)!;
 const t=(key:string,label:string,get?:(r:Row)=>any):Col=>({key,label,kind:'text',get:get||(r=>r[key]??'')});
 const d=(key:string,label:string):Col=>({key,label,kind:'date',get:r=>r[key]||''});
 const m=(key:string,label:string,get:(r:Row)=>number):Col=>({key,label,kind:'money',get});
 const n=(key:string,label:string,get:(r:Row)=>number):Col=>({key,label,kind:'number',get});
 return {
  projects:{label:'Projects',rows:data.projects,cols:[t('name','Project'),t('client','Client',r=>client(r.client_id)),t('status','Status'),t('project_type','Type'),t('owner','Owner',r=>r.owner_id?nameOf(r.owner_id):''),d('start_date','Start'),d('deadline','Deadline'),m('invoiced','Invoiced',r=>sum(data.invoices.filter(i=>i.project_id===r.id&&!['Draft','Cancelled'].includes(i.status)),i=>st(i).total)),m('rentals','Rentals',r=>sum(data.rentals.filter(x=>x.project_id===r.id),rentalCost)),m('cost','Production cost',r=>Number(r.cost)||0)]},
  invoices:{label:'Invoices',rows:data.invoices,cols:[t('number','Number'),t('name','Title'),t('client','Client',r=>client(r.client_id)),t('project','Project',r=>project(r.project_id)?.name||''),t('state','Status',r=>st(r).status),d('issue_date','Issued'),d('due_date','Due'),m('total','Total',r=>st(r).total),m('paid','Paid',r=>st(r).paid),m('balance','Balance',r=>st(r).balance)]},
  payments:{label:'Payments',rows:data.payments,cols:[t('invoice','Invoice',r=>invoices.get(r.invoice_id)?.number||''),t('client','Client',r=>client(invoices.get(r.invoice_id)?.client_id)),d('date','Date'),t('method','Method'),t('reference','Reference'),m('amount','Amount',r=>Number(r.amount)||0)]},
  rentals:{label:'Rentals',rows:data.rentals,cols:[t('name','Gear'),t('category','Category'),t('vendor','Vendor'),t('project','Project',r=>project(r.project_id)?.name||''),t('shoot','Shoot',r=>shoots.get(r.shoot_id)||''),t('status','Status'),d('start_date','Pickup'),d('end_date','Return'),n('quantity','Qty',r=>Number(r.quantity)||1),m('rate','Daily rate',r=>Number(r.rate)||0),n('days','Days',r=>rentalDays(r)),m('cost','Cost',r=>rentalCost(r))]},
  tasks:{label:'Tasks',rows:data.tasks,cols:[t('name','Task'),t('project','Project',r=>project(r.project_id)?.name||''),t('assignee','Assignee',r=>r.assignee_id?nameOf(r.assignee_id):'Unassigned'),t('priority','Priority'),t('status','Status'),d('due_date','Due')]},
  deliverables:{label:'Deliverables',rows:data.deliverables,cols:[t('name','Deliverable'),t('project','Project',r=>project(r.project_id)?.name||''),t('type','Type'),t('assignee','Assignee',r=>r.assignee_id?nameOf(r.assignee_id):'Unassigned'),t('status','Status'),d('due_date','Due'),n('revision_count','Revisions',r=>Number(r.revision_count)||0)]},
  shoots:{label:'Shoots',rows:data.shoots,cols:[t('name','Shoot'),t('project','Project',r=>project(r.project_id)?.name||''),d('date','Date'),t('location','Location'),t('status','Status'),m('rentals','Rental cost',r=>sum(data.rentals.filter(x=>x.shoot_id===r.id),rentalCost))]},
  estimates:{label:'Estimates',rows:data.estimates,cols:[t('number','Number'),t('name','Title'),t('client','Client',r=>client(r.client_id)),t('status','Status'),d('issue_date','Issued'),d('valid_until','Valid until'),m('total','Total',r=>totals(r.items||[],Number(r.discount)||0).total)]},
  leads:{label:'Leads',rows:data.leads,cols:[t('name','Lead'),t('company','Company'),t('source','Source'),t('status','Status'),t('service','Service'),m('budget','Budget',r=>Number(r.budget)||0),d('expected_date','Expected')]},
  clients:{label:'Clients',rows:data.clients,cols:[t('name','Client'),t('contact','Contact'),t('email','Email'),n('projects','Projects',r=>data.projects.filter(p=>p.client_id===r.id).length),m('invoiced','Invoiced',r=>sum(data.invoices.filter(i=>i.client_id===r.id&&!['Draft','Cancelled'].includes(i.status)),i=>st(i).total)),m('outstanding','Outstanding',r=>sum(data.invoices.filter(i=>i.client_id===r.id&&!['Draft','Cancelled'].includes(i.status)),i=>Math.max(0,st(i).balance)))]},
 };
}
const fmt=(c:Col,v:any)=>c.kind==='money'?money(Number(v)||0):c.kind==='date'?(v?displayDate(v):'—'):c.kind==='number'?String(Math.round((Number(v)||0)*100)/100):(v||'—');
const csvCell=(v:any)=>{const s=String(v??'');return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;};

export function DataExplore({data,current,nameOf}:{data:Data;current:string;nameOf:(id?:string)=>string}){
 const sets=useMemo(()=>buildDatasets(data,current,nameOf),[data,current,nameOf]);
 const [key,setKey]=useState('projects');const set=sets[key];
 const [q,setQ]=useState('');const [groupBy,setGroupBy]=useState('');const [measure,setMeasure]=useState('count');const [sort,setSort]=useState<{col:string;dir:1|-1}|null>(null);const [hidden,setHidden]=useState<string[]>([]);const [showCols,setShowCols]=useState(false);const {tip,show,hide}=useTip();
 const choose=(k:string)=>{setKey(k);setQ('');setGroupBy('');setMeasure('count');setSort(null);setHidden([]);};
 const cols=set.cols.filter(c=>!hidden.includes(c.key));
 const filtered=set.rows.filter(r=>!q||set.cols.some(c=>String(c.get(r)).toLowerCase().includes(q.toLowerCase())));
 const sortCol=set.cols.find(c=>c.key===sort?.col);
 const rows=sortCol?[...filtered].sort((a,b)=>{const x=sortCol.get(a),y=sortCol.get(b);return (typeof x==='number'&&typeof y==='number'?x-y:String(x).localeCompare(String(y)))*sort!.dir;}):filtered;
 const numeric=set.cols.filter(c=>c.kind==='money'||c.kind==='number');const groupable=set.cols.filter(c=>c.kind==='text'||c.kind==='date');
 const gCol=set.cols.find(c=>c.key===groupBy);const [agg,mKey]=measure==='count'?['count','']:measure.split(':');const mCol=set.cols.find(c=>c.key===mKey);
 const groups=gCol?[...filtered.reduce((map,r)=>{const raw=gCol.get(r);const g=gCol.kind==='date'?(raw?String(raw).slice(0,7):'No date'):(raw||'(blank)');return map.set(g,[...(map.get(g)||[]),r]);},new Map<string,Row[]>()).entries()].map(([g,items])=>{const vals=mCol?items.map(r=>Number(mCol.get(r))||0):[];const value=agg==='count'?items.length:agg==='sum'?vals.reduce((a,b)=>a+b,0):vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:0;return {g,label:gCol.kind==='date'&&g!=='No date'?monthLabel(g):g,count:items.length,value};}).sort((a,b)=>gCol.kind==='date'?a.g.localeCompare(b.g):b.value-a.value):[];
 const measureLabel=agg==='count'?'Rows':`${agg==='sum'?'Total':'Average'} ${mCol?.label.toLowerCase()}`;
 const showValue=(v:number)=>agg==='count'?String(v):mCol?.kind==='money'?money(v):String(Math.round(v*100)/100);
 const exportCsv=()=>{const lines=gCol?[[gCol.label,'Rows',measureLabel],...groups.map(g=>[g.label,g.count,Math.round(g.value*100)/100])]:[cols.map(c=>c.label),...rows.map(r=>cols.map(c=>{const v=c.get(r);return c.kind==='money'||c.kind==='number'?Math.round((Number(v)||0)*100)/100:v;}))];downloadFile(`grid-os-${key}${gCol?`-by-${gCol.key}`:''}.csv`,'﻿'+lines.map(l=>l.map(csvCell).join(',')).join('\r\n'),'text/csv;charset=utf-8');};
 const footer=numeric.filter(c=>c.kind==='money'&&c.key!=='rate'&&!hidden.includes(c.key));

 return <div className="ds">
  <div className="ds-datasets" role="tablist" aria-label="Dataset">{Object.entries(sets).map(([k,s])=><button key={k} role="tab" aria-selected={k===key} className={k===key?'active':''} onClick={()=>choose(k)}>{s.label}<small>{s.rows.length}</small></button>)}</div>
  <div className="ds-filters ds-explore-bar">
   <input className="ds-search" aria-label="Search rows" placeholder={`Search ${set.label.toLowerCase()}…`} value={q} onChange={e=>setQ(e.target.value)}/>
   <label className="ds-field">Group by<select value={groupBy} onChange={e=>setGroupBy(e.target.value)}><option value="">No grouping</option>{groupable.map(c=><option key={c.key} value={c.key}>{c.label}{c.kind==='date'?' (month)':''}</option>)}</select></label>
   <label className="ds-field">Measure<select value={measure} disabled={!groupBy} onChange={e=>setMeasure(e.target.value)}><option value="count">Count of rows</option>{numeric.map(c=><option key={'s'+c.key} value={'sum:'+c.key}>Total {c.label.toLowerCase()}</option>)}{numeric.map(c=><option key={'a'+c.key} value={'avg:'+c.key}>Average {c.label.toLowerCase()}</option>)}</select></label>
   {!gCol&&<div className="ds-cols"><button className="button small" aria-expanded={showCols} onClick={()=>setShowCols(o=>!o)}>Columns · {cols.length}/{set.cols.length}</button>{showCols&&<div className="ds-col-panel">{set.cols.map(c=><label key={c.key}><input type="checkbox" checked={!hidden.includes(c.key)} disabled={!hidden.includes(c.key)&&cols.length===1} onChange={()=>setHidden(h=>h.includes(c.key)?h.filter(x=>x!==c.key):[...h,c.key])}/>{c.label}</label>)}</div>}</div>}
   <button className="button small ds-export" onClick={exportCsv}><Download size={14}/>Export CSV</button>
  </div>
  <p className="ds-hint">{gCol?`${groups.length} group${groups.length===1?'':'s'} from ${filtered.length} row${filtered.length===1?'':'s'}`:`${rows.length} of ${set.rows.length} row${set.rows.length===1?'':'s'}`}{q&&` matching “${q}”`}</p>
  {gCol?<div className="ds-grid ds-explore-grid">
   <section className="panel"><div className="panel-heading"><h2>{measureLabel} by {gCol.label.toLowerCase()}</h2></div><div className="viz-root"><HBars series="series-1" show={show} hide={hide} empty="Nothing to group." items={groups.map(g=>({key:g.g,label:g.label,value:g.value,display:showValue(g.value),extra:[['','Rows',String(g.count)]]}))}/></div></section>
   <section className="panel"><div className="table-wrap"><table><thead><tr><th>{gCol.label}</th><th>Rows</th><th>{measureLabel}</th></tr></thead><tbody>{groups.map(g=><tr key={g.g}><td>{g.label}</td><td>{g.count}</td><td>{showValue(g.value)}</td></tr>)}</tbody>{agg!=='avg'&&<tfoot><tr><td>Total</td><td>{filtered.length}</td><td>{showValue(groups.reduce((a,g)=>a+g.value,0))}</td></tr></tfoot>}</table></div></section>
  </div>
  :<section className="panel"><div className="table-wrap ds-table"><table><thead><tr>{cols.map(c=><th key={c.key} aria-sort={sort?.col===c.key?(sort.dir===1?'ascending':'descending'):'none'}><button className={`ds-sort ${c.kind==='money'||c.kind==='number'?'num':''}`} onClick={()=>setSort(s=>s?.col===c.key?(s.dir===1?{col:c.key,dir:-1}:null):{col:c.key,dir:1})}>{c.label}{sort?.col===c.key?(sort.dir===1?<ArrowUp size={11}/>:<ArrowDown size={11}/>):<ArrowUpDown size={11} className="ds-sort-idle"/>}</button></th>)}</tr></thead>
   <tbody>{rows.slice(0,300).map(r=><tr key={r.id}>{cols.map((c,i)=><td key={c.key} className={c.kind==='money'||c.kind==='number'?'num':''}>{i===0?<Link className="row-title" href={`/${key}/${r.id}`}>{fmt(c,c.get(r))}</Link>:fmt(c,c.get(r))}</td>)}</tr>)}</tbody>
   {footer.length>0&&rows.length>0&&<tfoot><tr>{cols.map((c,i)=><td key={c.key} className={c.kind==='money'?'num':''}>{i===0?'Total':c.kind==='money'&&c.key!=='rate'?money(sum(rows,r=>Number(c.get(r))||0)):''}</td>)}</tr></tfoot>}
  </table>{!rows.length&&<p className="prose muted ds-empty">No rows match.</p>}{rows.length>300&&<p className="ds-hint">Showing the first 300 rows. Export CSV for the full set.</p>}</div></section>}
  <TipBox tip={tip}/>
 </div>;
}
