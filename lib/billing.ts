import {totals,type Item,type Row} from './domain';

/** Automatic monthly invoicing. A schedule belongs to a project; on its billing day each month a draft
 *  invoice is created for that month. Pure functions — the database (migration 008) mirrors these rules. */
export type BillingSchedule={
 id:string;workspace_id?:string;project_id:string;client_id:string;
 items:Item[];discount:number;payment_terms?:string;notes?:string;
 day:number;            // day of the month the invoice is prepared (29 by default; clamped to short months)
 due_days:number;       // payment due this many days after the invoice date
 starts_on:string;      // first month billed, YYYY-MM
 ends_on?:string|null;  // last month billed, YYYY-MM (optional)
 active:boolean;created_at?:string;
};
export const DEFAULT_BILLING_DAY=29;
/** How far back a missed run is caught up (e.g. if nobody opened the app for a while). */
export const MAX_CATCH_UP_MONTHS=12;

const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
export const periodOf=(date:string)=>date.slice(0,7);
export const periodLabel=(period:string)=>`${MONTHS[Number(period.slice(5,7))-1]} ${period.slice(0,4)}`;
const pad=(n:number)=>String(n).padStart(2,'0');
const daysIn=(y:number,m:number)=>new Date(Date.UTC(y,m,0)).getUTCDate();
export const addMonths=(period:string,n:number)=>{const y=Number(period.slice(0,4)),m=Number(period.slice(5,7))-1+n;const yy=y+Math.floor(m/12),mm=((m%12)+12)%12+1;return `${yy}-${pad(mm)}`;};
const addDays=(date:string,n:number)=>{const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};

/** The date a period's invoice is prepared: the billing day, or the month's last day if the month is shorter. */
export function runDate(period:string,day:number){
 const y=Number(period.slice(0,4)),m=Number(period.slice(5,7));
 return `${period}-${pad(Math.min(Math.max(1,day),daysIn(y,m)))}`;
}

/** Months whose invoice is due by `today` and hasn't been created yet (oldest first, at most 12 back). */
export function duePeriods(s:BillingSchedule,today:string,done:Set<string>){
 if(!s.active)return [];
 const out:string[]=[];const current=periodOf(today);
 let p=s.starts_on>addMonths(current,-(MAX_CATCH_UP_MONTHS-1))?s.starts_on:addMonths(current,-(MAX_CATCH_UP_MONTHS-1));
 for(;p<=current;p=addMonths(p,1)){
  if(s.ends_on&&p>s.ends_on)break;
  if(runDate(p,s.day)<=today&&!done.has(p))out.push(p);
 }
 return out;
}

/** The next invoice this schedule will prepare (date and month), or null if it has ended or is paused. */
export function nextRun(s:BillingSchedule,today:string,done:Set<string>){
 if(!s.active)return null;
 for(let p=s.starts_on>periodOf(today)?s.starts_on:periodOf(today),i=0;i<24;p=addMonths(p,1),i++){
  if(s.ends_on&&p>s.ends_on)return null;
  if(!done.has(p)&&runDate(p,s.day)>=today)return {period:p,date:runDate(p,s.day)};
 }
 return null;
}

/** The draft invoice for one month of a schedule. */
export function invoiceFor(s:BillingSchedule,period:string,projectName:string):Omit<Row,"id">{
 const date=runDate(period,s.day);
 return {name:`${projectName} — ${periodLabel(period)}`,client_id:s.client_id,project_id:s.project_id,issue_date:date,due_date:addDays(date,Math.max(0,s.due_days)),
  items:s.items.map(i=>({...i})),discount:s.discount||0,payment_terms:s.payment_terms||'',notes:s.notes||'',status:'Draft',schedule_id:s.id,billing_period:period};
}

/** Monthly total for display. */
export const scheduleTotal=(s:Pick<BillingSchedule,'items'|'discount'>)=>totals(s.items,s.discount||0).total;
/** Months already invoiced for a schedule, from the invoices list. */
export const billedPeriods=(invoices:Row[],scheduleId:string)=>new Set(invoices.filter(i=>i.schedule_id===scheduleId&&i.billing_period).map(i=>String(i.billing_period)));
