import Decimal from 'decimal.js';
export const statuses = {
 leads:['New','Contacted','Discussion','Proposal Sent','Won','Lost'],
 estimates:['Draft','Sent','Accepted','Rejected','Expired'],
 projects:['Planning','Pre-production','Shoot Scheduled','In Production','Editing','Client Review','Revisions','Ready for Delivery','Delivered','Completed','On Hold'],
 shoots:['Planned','Confirmed','Completed','Cancelled'],
 deliverables:['Not Started','In Progress','Internal Review','Client Review','Revision','Approved','Delivered'],
 tasks:['To Do','In Progress','Review','Done'],
 invoices:['Draft','Sent','Partially Paid','Paid','Overdue','Cancelled'],
 rentals:['Requested','Booked','Picked Up','Returned','Cancelled']
};
export type Entity = 'leads'|'clients'|'estimates'|'projects'|'shoots'|'rentals'|'deliverables'|'tasks'|'invoices'|'payments';
export type Row = {id:string;workspace_id?:string;created_at?:string;updated_at?:string;[key:string]:any};
export type Item = {service:string;description:string;quantity:number;unit?:string;rate:number;tax:number};
export type Data = Record<Entity,Row[]>;
export const entities:Entity[]=['leads','clients','estimates','projects','shoots','rentals','deliverables','tasks','invoices','payments'];
export const emptyData = ():Data => ({leads:[],clients:[],estimates:[],projects:[],shoots:[],rentals:[],deliverables:[],tasks:[],invoices:[],payments:[]});
// Intl formatters are expensive to create, so each one is built once and reused.
const memo=<T,>(make:(key:string)=>T)=>{const cache=new Map<string,T>();return (key:string)=>{let v=cache.get(key);if(!v){v=make(key);cache.set(key,v);}return v;};};
const moneyFormat=memo(currency=>new Intl.NumberFormat('en-IN',{style:'currency',currency,maximumFractionDigits:2}));
const dayFormat=memo(tz=>new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}));
const displayFormat=new Intl.DateTimeFormat('en-IN',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});
export const money=(n:number|string=0,currency='INR')=>moneyFormat(currency).format(Number(n)||0);
export const today=(tz='Asia/Kolkata')=>dayFormat(tz).format(new Date());
export const displayDate=(d?:string)=>{if(!d)return 'No date';const t=new Date(d.slice(0,10)+'T12:00:00Z');return isNaN(t.getTime())?'No date':displayFormat.format(t);};


export function totals(items:Item[],discount=0){
 const subtotal=items.reduce((a,i)=>a.plus(new Decimal(i.quantity||0).mul(i.rate||0).toDecimalPlaces(2)),new Decimal(0));
 const off=Decimal.min(Decimal.max(discount||0,0),subtotal);
 const factor=subtotal.eq(0)?new Decimal(0):subtotal.minus(off).div(subtotal);
 const tax=items.reduce((a,i)=>a.plus(new Decimal(i.quantity||0).mul(i.rate||0).toDecimalPlaces(2).mul(factor).mul(i.tax||0).div(100).toDecimalPlaces(2)),new Decimal(0));
 return {subtotal:subtotal.toNumber(),discount:off.toNumber(),tax:tax.toNumber(),total:subtotal.minus(off).plus(tax).toDecimalPlaces(2).toNumber()};
}
export function invoiceState(invoice:Row,payments:Row[],date=today()){
 const total=totals(invoice.items||[],Number(invoice.discount)||0).total;
 const paid=payments.filter(p=>p.invoice_id===invoice.id).reduce((a,p)=>a.plus(p.amount),new Decimal(0)).toNumber();
 const balance=new Decimal(total).minus(paid).toDecimalPlaces(2).toNumber();
 const status=['Cancelled','Draft'].includes(invoice.status)?invoice.status:balance<=0?'Paid':invoice.due_date&&invoice.due_date<date?'Overdue':paid>0?'Partially Paid':'Sent';
 return {total,paid,balance,status};
}
/** Rental days: explicit days, else pickup→return inclusive, else one day. */
export const rentalDays=(r:Row)=>Number(r.days)>0?Number(r.days):r.start_date&&r.end_date?Math.max(1,Math.round((Date.parse(r.end_date)-Date.parse(r.start_date))/86400000)+1):1;
export const rentalCost=(r:Row)=>r.status==='Cancelled'?0:new Decimal(Number(r.quantity)||1).mul(Number(r.rate)||0).mul(rentalDays(r)).toDecimalPlaces(2).toNumber();
/** Every invoice's state, grouping payments once (O(invoices + payments)) instead of scanning all payments per invoice. */
export function invoiceStates(data:{invoices:Row[];payments:Row[]},date=today()){
 const byInvoice=new Map<string,Row[]>();
 for(const p of data.payments){const list=byInvoice.get(p.invoice_id);if(list)list.push(p);else byInvoice.set(p.invoice_id,[p]);}
 return new Map(data.invoices.map(i=>[i.id,invoiceState(i,byInvoice.get(i.id)||[],date)]));
}
/** Next document number (EST-/INV-), one past the highest in use, so deleting a draft never causes a duplicate. */
export function nextNumber(rows:Row[],prefix:string){
 const max=rows.reduce((m,r)=>{const n=Number(String(r.number||'').match(/(\d+)$/)?.[1]);return Number.isFinite(n)&&n>m?n:m;},0);
 return `${prefix}-${String(max+1).padStart(5,'0')}`;
}
export const blankItem=():Item=>({service:'',description:'',quantity:1,rate:0,tax:18});
export const terminal=(status:string)=>['Done','Delivered','Completed','Cancelled','Lost','Rejected','Approved'].includes(status);
export type Field={key:string;label:string;type?:'text'|'textarea'|'date'|'time'|'number'|'email'|'select';options?:string[];relation?:Entity|'members';required?:boolean};
const f=(key:string,label:string,type:Field['type']='text',extra:Partial<Field>={}):Field=>({key,label,type,...extra});
export const fields:Record<Entity,Field[]>={
 leads:[f('name','Lead name','text',{required:true}),f('company','Company / brand'),f('email','Email','email'),f('phone','Phone'),f('source','Source','select',{options:['Referral','Instagram','Website','Returning client','Other']}),f('service','Service requested'),f('budget','Estimated budget','number'),f('owner_id','Assigned to','select',{relation:'members'}),f('expected_date','Expected project date','date'),f('notes','Notes','textarea')],
 clients:[f('name','Client / company','text',{required:true}),f('contact','Contact person'),f('email','Email','email'),f('phone','Phone'),f('billing_address','Billing address','textarea'),f('tax_id','GST / tax number')],
 projects:[f('name','Project name','text',{required:true}),f('client_id','Client','select',{relation:'clients',required:true}),f('project_type','Project type','select',{options:['Social content','Campaign film','Photography','Event','Brand film','Other']}),f('owner_id','Project owner','select',{relation:'members'}),f('start_date','Start date','date'),f('deadline','Deadline','date'),f('cost','Production cost (₹)','number'),f('brief','Project brief','textarea')],
 shoots:[f('name','Shoot title','text',{required:true}),f('project_id','Project','select',{relation:'projects',required:true}),f('date','Shoot date','date',{required:true}),f('start_time','Start time','time',{required:true}),f('end_time','Estimated end time','time'),f('location','Location'),f('shoot_type','Shoot type'),f('crew','Crew notes'),f('equipment','Equipment notes','textarea'),f('shot_notes','Shot notes','textarea'),f('notes','General notes','textarea')],
 rentals:[f('name','Gear item','text',{required:true}),f('category','Category','select',{options:['Camera','Lens','Lighting','Grip','Audio','Drone','Monitor','Vehicle','Studio','Other']}),f('project_id','Project','select',{relation:'projects',required:true}),f('shoot_id','Shoot','select',{relation:'shoots'}),f('vendor','Rental vendor'),f('quantity','Quantity','number'),f('rate','Daily rate (₹)','number',{required:true}),f('days','Rental days','number'),f('start_date','Pickup date','date'),f('end_date','Return date','date'),f('reference','Booking reference'),f('notes','Notes','textarea')],
 deliverables:[f('name','Deliverable name','text',{required:true}),f('project_id','Project','select',{relation:'projects',required:true}),f('type','Type','select',{options:['Reel','Film','Photography','Design','Other']}),f('assignee_id','Assigned to','select',{relation:'members'}),f('due_date','Due date','date'),f('revision_count','Revision count','number'),f('delivery_url','Delivery link'),f('notes','Notes','textarea')],
 tasks:[f('name','Task title','text',{required:true}),f('project_id','Project','select',{relation:'projects',required:true}),f('deliverable_id','Linked deliverable','select',{relation:'deliverables'}),f('assignee_id','Assignee','select',{relation:'members'}),f('priority','Priority','select',{options:['Low','Medium','High','Urgent']}),f('due_date','Due date','date'),f('notes','Notes','textarea')],
 estimates:[f('name','Estimate title','text',{required:true}),f('client_id','Client','select',{relation:'clients',required:true}),f('lead_id','Source lead','select',{relation:'leads'}),f('issue_date','Issue date','date',{required:true}),f('valid_until','Valid until','date',{required:true}),f('discount','Discount (₹)','number'),f('notes','Notes','textarea'),f('payment_terms','Payment terms','textarea'),f('terms','Terms & conditions','textarea')],
 invoices:[f('name','Invoice title','text',{required:true}),f('client_id','Client','select',{relation:'clients',required:true}),f('project_id','Project','select',{relation:'projects',required:true}),f('issue_date','Issue date','date',{required:true}),f('due_date','Due date','date',{required:true}),f('discount','Discount (₹)','number'),f('notes','Notes','textarea'),f('payment_terms','Payment terms','textarea')],
 payments:[f('invoice_id','Invoice','select',{relation:'invoices',required:true}),f('amount','Amount (₹)','number',{required:true}),f('date','Payment date','date',{required:true}),f('method','Method','select',{options:['Bank transfer','UPI','Cash','Card','Other']}),f('reference','Reference'),f('notes','Notes','textarea')]
};
export const titles:Record<Entity,string>={leads:'Leads',clients:'Clients',projects:'Projects',shoots:'Shoots',rentals:'Rentals',tasks:'Tasks',deliverables:'Deliverables',estimates:'Estimates',invoices:'Invoices',payments:'Payments'};
export const singular:Record<Entity,string>={leads:'lead',clients:'client',projects:'project',shoots:'shoot',rentals:'rental',tasks:'task',deliverables:'deliverable',estimates:'estimate',invoices:'invoice',payments:'payment'};
