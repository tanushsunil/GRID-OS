import {statuses,totals,invoiceState,type Data,type Row} from './domain';
import {recordSchema} from './validation';
import type {Cell} from './tabular';

/** Importing and exporting clients, leads and invoices as tables. Pure functions: no storage, no network. */
export type ImportKind='clients'|'leads'|'invoices';
export const importKinds:ImportKind[]=['clients','leads','invoices'];
type ColType='text'|'long'|'email'|'number'|'date'|'option';
export type Column={key:string;label:string;type:ColType;required?:boolean;options?:string[];aliases?:string[];hint?:string};

const LEAD_SOURCES=['Referral','Instagram','Website','Returning client','Other'];
const INVOICE_STATUSES=['Draft','Sent','Paid','Partially Paid','Overdue','Cancelled'];

/** The columns GRID OS understands for each list. Labels double as export headers and template headers. */
export const columns:Record<ImportKind,Column[]>={
 clients:[
  {key:'name',label:'Client name',type:'text',required:true,aliases:['client','company','company name','customer','customer name','business','brand','organisation','organization','client / company']},
  {key:'contact',label:'Contact person',type:'text',aliases:['contact','contact name','person','point of contact','poc']},
  {key:'email',label:'Email',type:'email',aliases:['email address','e-mail','mail']},
  {key:'phone',label:'Phone',type:'text',aliases:['mobile','phone number','contact number','mobile number','whatsapp','tel','telephone']},
  {key:'billing_address',label:'Billing address',type:'long',aliases:['address','billing','office address']},
  {key:'tax_id',label:'GST number',type:'text',aliases:['gst','gstin','gst no','tax id','tax number','gst / tax number','vat','pan']},
 ],
 leads:[
  {key:'name',label:'Lead name',type:'text',required:true,aliases:['name','lead','contact','contact name','full name','person']},
  {key:'company',label:'Company',type:'text',aliases:['company / brand','brand','organisation','organization','business']},
  {key:'email',label:'Email',type:'email',aliases:['email address','e-mail','mail']},
  {key:'phone',label:'Phone',type:'text',aliases:['mobile','phone number','contact number','whatsapp']},
  {key:'source',label:'Source',type:'option',options:LEAD_SOURCES,aliases:['lead source','channel','came from']},
  {key:'service',label:'Service requested',type:'text',aliases:['service','requirement','enquiry','inquiry','interested in']},
  {key:'budget',label:'Budget',type:'number',aliases:['estimated budget','value','deal value','amount']},
  {key:'status',label:'Status',type:'option',options:[...statuses.leads],aliases:['stage','lead status']},
  {key:'expected_date',label:'Expected date',type:'date',aliases:['expected project date','project date','event date','date']},
  {key:'notes',label:'Notes',type:'long',aliases:['comments','remarks','description','details']},
 ],
 invoices:[
  {key:'number',label:'Invoice number',type:'text',aliases:['invoice no','invoice #','inv no','invoice id','number','no','#','bill no'],hint:'Rows with the same number become one invoice with several line items.'},
  {key:'name',label:'Invoice title',type:'text',aliases:['title','subject','invoice name']},
  {key:'client',label:'Client',type:'text',required:true,aliases:['client name','customer','customer name','bill to','company']},
  {key:'project',label:'Project',type:'text',aliases:['project name','job','campaign']},
  {key:'issue_date',label:'Issue date',type:'date',required:true,aliases:['date','invoice date','issued','issued on','bill date']},
  {key:'due_date',label:'Due date',type:'date',aliases:['due','due on','payment due']},
  {key:'status',label:'Status',type:'option',options:INVOICE_STATUSES,aliases:['invoice status','payment status','state']},
  {key:'amount_paid',label:'Amount paid',type:'number',aliases:['paid','amount received','received','paid amount']},
  {key:'payment_date',label:'Payment date',type:'date',aliases:['paid on','date paid','received on','payment received on']},
  {key:'payment_method',label:'Payment method',type:'text',aliases:['method','paid via','mode','payment mode']},
  {key:'discount',label:'Discount',type:'number',aliases:['discount amount']},
  {key:'notes',label:'Notes',type:'long',aliases:['remarks','comments']},
  {key:'payment_terms',label:'Payment terms',type:'long',aliases:['terms']},
  {key:'service',label:'Service',type:'text',aliases:['item','line item','particulars','service item','product','description of service']},
  {key:'item_description',label:'Item description',type:'long',aliases:['description','details','item details']},
  {key:'quantity',label:'Quantity',type:'number',aliases:['qty','hours','units']},
  {key:'unit',label:'Unit',type:'text',aliases:['uom']},
  {key:'rate',label:'Rate',type:'number',aliases:['price','unit price','rate per unit','cost']},
  {key:'tax',label:'Tax %',type:'number',aliases:['tax','gst %','gst rate','tax rate','gst percent']},
  {key:'amount',label:'Amount',type:'number',aliases:['line amount','line total','subtotal','invoice amount','amount before tax','taxable value'],hint:'Used when there’s no Rate: the amount before tax for that line (or the whole invoice).'},
 ],
};

/* ---------- Matching file columns to GRID OS columns ---------- */
const norm=(s:string)=>s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9#%]/g,'');
/** Best guess of which file column feeds each GRID OS column (exact name or known alias). */
export function autoMap(kind:ImportKind,headers:string[]):Record<string,number|null>{
 const used=new Set<number>();const map:Record<string,number|null>={};
 for(const c of columns[kind]){
  const names=[c.label,c.key,...(c.aliases||[])].map(norm);
  const i=headers.findIndex((h,idx)=>!used.has(idx)&&names.includes(norm(h)));
  map[c.key]=i>=0?i:null;if(i>=0)used.add(i);
 }
 return map;
}

/* ---------- Cleaning values ---------- */
const MONTHS=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
const pad=(n:number)=>String(n).padStart(2,'0');
const valid=(y:number,m:number,d:number)=>{const t=new Date(Date.UTC(y,m-1,d));return t.getUTCFullYear()===y&&t.getUTCMonth()===m-1&&t.getUTCDate()===d?`${y}-${pad(m)}-${pad(d)}`:null;};
const year=(y:number)=>y<100?2000+y:y;
/** Dates from Excel cells, Excel serial numbers, ISO text, 07/10/2026, 7-Oct-26, "Oct 7, 2026" and similar.
 *  Slash/dash/dot dates are read day-first (India) unless monthFirst is set; an impossible day/month is flipped. */
export function parseDate(v:Cell,monthFirst=false):string|null{
 if(v==null||v==='')return null;
 if(v instanceof Date)return isNaN(v.getTime())?null:valid(v.getUTCFullYear(),v.getUTCMonth()+1,v.getUTCDate());
 if(typeof v==='number'){if(v>20000&&v<80000){const d=new Date(Date.UTC(1899,11,30)+Math.round(v)*86400000);return valid(d.getUTCFullYear(),d.getUTCMonth()+1,d.getUTCDate());}return null;}
 const s=String(v).trim();let m:RegExpMatchArray|null;
 if((m=s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T].*)?$/)))return valid(+m[1],+m[2],+m[3]);
 if((m=s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})(?:\s.*)?$/))){let a=+m[1],b=+m[2];if(monthFirst?(a>12&&b<=12):(b>12&&a<=12))[a,b]=[b,a];return monthFirst?valid(year(+m[3]),a,b):valid(year(+m[3]),b,a);}
 if((m=s.match(/^(\d{1,2})(?:st|nd|rd|th)?[\s\-/.]+([a-z]{3,9})[\s\-/.,]+(\d{2}|\d{4})$/i))){const mo=MONTHS.indexOf(m[2].slice(0,3).toLowerCase());return mo<0?null:valid(year(+m[3]),mo+1,+m[1]);}
 if((m=s.match(/^([a-z]{3,9})[\s\-/.]+(\d{1,2})(?:st|nd|rd|th)?,?[\s\-/.]+(\d{2}|\d{4})$/i))){const mo=MONTHS.indexOf(m[1].slice(0,3).toLowerCase());return mo<0?null:valid(year(+m[3]),mo+1,+m[2]);}
 return null;
}
/** Numbers from cells like 12500, "₹12,500.00", "1,25,000", "12 500", "Rs. 900". Null when blank, NaN when unreadable. */
export function parseNumber(v:Cell):number|null{
 if(v==null||v==='')return null;
 if(typeof v==='number')return Number.isFinite(v)?v:NaN;
 const s=String(v).trim().replace(/^(rs\.?|inr|₹|\$)\s*/i,'').replace(/[₹,\s]/g,'').replace(/%$/,'');
 if(s==='')return null;
 return /^-?\d*\.?\d+$/.test(s)?Number(s):NaN;
}
const text=(v:Cell)=>v==null?'':v instanceof Date?(parseDate(v)??''):String(v).trim();
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const STATUS_WORDS:Record<string,string>={unpaid:'Sent',pending:'Sent',due:'Sent',outstanding:'Sent',issued:'Sent',open:'Sent',sent:'Sent',paid:'Paid',settled:'Paid',complete:'Paid',completed:'Paid',received:'Paid',partial:'Partially Paid',partlypaid:'Partially Paid',partiallypaid:'Partially Paid',overdue:'Overdue',draft:'Draft',cancelled:'Cancelled',canceled:'Cancelled',void:'Cancelled',lost:'Lost',won:'Won',contacted:'Contacted',new:'New',proposal:'Proposal Sent',proposalsent:'Proposal Sent',discussion:'Discussion'};
const option=(v:string,options:string[])=>options.find(o=>norm(o)===norm(v))??options.find(o=>o===STATUS_WORDS[norm(v)])??null;

type Problem={row:number;message:string};
/** Turn one file row into clean values for a list's columns, collecting readable problems. */
function readRow(kind:ImportKind,map:Record<string,number|null>,cells:Cell[],monthFirst:boolean,row:number,problems:Problem[]){
 const out:Record<string,any>={};
 for(const c of columns[kind]){
  const i=map[c.key];const raw=i==null?null:cells[i]??null;
  if(c.type==='date'){const d=parseDate(raw,monthFirst);if(raw!=null&&text(raw)!==''&&!d)problems.push({row,message:`${c.label} “${text(raw)}” isn’t a date GRID OS can read.`});out[c.key]=d;}
  else if(c.type==='number'){const n=parseNumber(raw);if(Number.isNaN(n))problems.push({row,message:`${c.label} “${text(raw)}” isn’t a number.`});else if(n!=null&&n<0)problems.push({row,message:`${c.label} can’t be negative.`});out[c.key]=Number.isNaN(n)?null:n;}
  else if(c.type==='option'){const t=text(raw);const o=t?option(t,c.options!):null;if(t&&!o)problems.push({row,message:`${c.label} “${t}” should be one of: ${c.options!.join(', ')}.`});out[c.key]=o;}
  else if(c.type==='email'){const t=text(raw);if(t&&!EMAIL.test(t))problems.push({row,message:`Email “${t}” isn’t a valid address.`});out[c.key]=t&&EMAIL.test(t)?t.toLowerCase():'';}
  else out[c.key]=text(raw).slice(0,c.type==='long'?20000:500);
 }
 return out;
}

/* ---------- Planning an import ---------- */
export type InvoiceImport={number:string;name:string;client:string;project:string;issue_date:string;due_date:string;discount:number;notes:string;payment_terms:string;status:'Draft'|'Sent'|'Cancelled';amount_paid:number;payment_date:string|null;payment_method:string;items:{service:string;description:string;quantity:number;unit:string;rate:number;tax:number}[];total:number;rows:number[]};
export type ImportPlan={kind:ImportKind;ready:any[];skipped:Problem[];problems:Problem[];newClients:string[];newProjects:string[];total:number};
const key=(s:unknown)=>String(s??'').trim().toLowerCase();
const zodMessage=(err:any)=>err?.issues?.map((i:any)=>`${columns.clients.concat(columns.leads).find(c=>c.key===i.path?.[0])?.label||i.path?.[0]||'Value'}: ${i.message}`).join('. ')||'This row isn’t valid.';

/** Work out exactly what an import would do — nothing is saved here. Row numbers match the spreadsheet (header = row 1). */
export function planImport(kind:ImportKind,cells:Cell[][],map:Record<string,number|null>,data:Data,{monthFirst=false}:{monthFirst?:boolean}={}):ImportPlan{
 const problems:Problem[]=[];const skipped:Problem[]=[];const ready:any[]=[];
 const plan=(extra:Partial<ImportPlan>={}):ImportPlan=>({kind,ready,skipped,problems,newClients:[],newProjects:[],total:cells.length,...extra});
 for(const c of columns[kind])if(c.required&&map[c.key]==null)problems.push({row:0,message:`Choose which column holds “${c.label}”.`});
 if(problems.length)return plan();

 if(kind==='clients'||kind==='leads'){
  const names=new Set(data[kind].map(r=>kind==='clients'?key(r.name):`${key(r.name)}|${key(r.company)}`));
  const emails=new Set(data[kind].map(r=>key(r.email)).filter(Boolean));
  const schema=recordSchema(kind);
  cells.forEach((cellsRow,i)=>{
   const row=i+2;const before=problems.length;const v=readRow(kind,map,cellsRow,monthFirst,row,problems);
   if(problems.length>before)return;
   if(!v.name){problems.push({row,message:`${columns[kind][0].label} is empty.`});return;}
   if(kind==='leads')v.status=v.status||'New';
   const id=kind==='clients'?key(v.name):`${key(v.name)}|${key(v.company)}`;
   if(names.has(id)||(v.email&&emails.has(key(v.email)))){skipped.push({row,message:`${v.name} is already in GRID OS.`});return;}
   const parsed=schema.safeParse(v);
   if(!parsed.success){problems.push({row,message:zodMessage(parsed.error)});return;}
   names.add(id);if(v.email)emails.add(key(v.email));ready.push(parsed.data);
  });
  return plan();
 }

 // Invoices: rows sharing an invoice number are one invoice; each row adds a line item.
 const groups=new Map<string,{rows:number[];values:Record<string,any>[]}>();
 cells.forEach((cellsRow,i)=>{
  const row=i+2;const before=problems.length;const v=readRow('invoices',map,cellsRow,monthFirst,row,problems);
  if(problems.length>before)return;
  const g=v.number?`n:${key(v.number)}`:`r:${row}`;
  if(!groups.has(g))groups.set(g,{rows:[],values:[]});groups.get(g)!.rows.push(row);groups.get(g)!.values.push(v);
 });
 const existingNumbers=new Set(data.invoices.map(r=>key(r.number)));
 const clientsByName=new Map(data.clients.map(c=>[key(c.name),c]));
 const projectExists=(clientName:string,project:string)=>{const c=clientsByName.get(key(clientName));return !!c&&data.projects.some(p=>p.client_id===c.id&&key(p.name)===key(project));};
 const newClients=new Map<string,string>();const newProjects=new Map<string,string>();
 for(const {rows,values} of groups.values()){
  const first=(k:string)=>values.find(v=>v[k]!=null&&v[k]!=='')?.[k]??null;
  const row=rows[0];const where=rows.length>1?`Rows ${rows.join(', ')}`:`Row ${row}`;
  const number=String(first('number')||'');const client=String(first('client')||'');
  const fail=(message:string)=>{problems.push({row,message:rows.length>1?`${message} (${where.toLowerCase()})`:message});};
  if(number&&existingNumbers.has(key(number))){skipped.push({row,message:`Invoice ${number} is already in GRID OS.`});continue;}
  if(!client){fail('Client is empty.');continue;}
  const issue=first('issue_date');if(!issue){fail('Issue date is empty.');continue;}
  const due=first('due_date')||issue;if(due<issue){fail('Due date is before the issue date.');continue;}
  const items:InvoiceImport['items']=[];let bad='';
  for(const v of values){
   const hasLine=v.service||v.rate!=null||v.amount!=null||v.quantity!=null;if(!hasLine)continue;
   const quantity=v.quantity??1;if(!(quantity>0)){bad='Quantity must be more than zero.';break;}
   const rate=v.rate??(v.amount!=null?v.amount/quantity:null);if(rate==null){bad='Each line needs a Rate or an Amount.';break;}
   const tax=v.tax??0;if(tax>100){bad='Tax % can’t be more than 100.';break;}
   items.push({service:String(v.service||first('name')||'Services').slice(0,200),description:String(v.item_description||''),quantity,unit:String(v.unit||''),rate:Math.round(rate*100)/100,tax});
  }
  if(bad){fail(bad);continue;}
  if(!items.length){fail('There’s no amount: add a Rate or Amount column.');continue;}
  if(items.length>100){fail('An invoice can have at most 100 line items.');continue;}
  const discount=first('discount')??0;const sums=totals(items as any,discount);
  if(discount>Number(sums.subtotal)){fail('Discount is more than the invoice subtotal.');continue;}
  const total=Number(sums.total);
  const said=first('status');let paid=first('amount_paid')??0;
  if(said==='Paid'&&!paid)paid=total;
  const status:InvoiceImport['status']=said==='Draft'?'Draft':said==='Cancelled'?'Cancelled':'Sent';
  if(paid>total+0.005){fail(`Amount paid (${paid}) is more than the invoice total (${total}).`);continue;}
  if(paid>0&&status!=='Sent'){fail(`${status} invoices can’t have payments recorded.`);continue;}
  if(said==='Partially Paid'&&!(paid>0&&paid<total)){fail('Partially paid invoices need an Amount paid that’s less than the total.');continue;}
  const project=String(first('project')||'Imported invoices');
  if(!clientsByName.has(key(client))&&!newClients.has(key(client)))newClients.set(key(client),client);
  if(!projectExists(client,project))newProjects.set(`${key(client)}|${key(project)}`,`${project} (${client})`);
  if(number)existingNumbers.add(key(number));
  ready.push({number,name:String(first('name')||first('project')||(number?`Invoice ${number}`:items[0].service)).slice(0,200),client,project,issue_date:issue,due_date:due,discount,notes:String(first('notes')||''),payment_terms:String(first('payment_terms')||''),status,amount_paid:Math.round(paid*100)/100,payment_date:paid>0?(first('payment_date')||due):null,payment_method:String(first('payment_method')||''),items,total,rows} satisfies InvoiceImport);
 }
 return plan({newClients:[...newClients.values()],newProjects:[...newProjects.values()]});
}

/* ---------- Exporting ---------- */
/** Rows for export, using the same column names the importer reads, so an export can be imported back. */
export function exportTable(kind:ImportKind,data:Data,current?:string):{headers:string[];rows:Cell[][]}{
 if(kind!=='invoices'){const cols=columns[kind];return {headers:cols.map(c=>c.label),rows:data[kind].map(r=>cols.map(c=>c.type==='date'?(r[c.key]||null):c.type==='number'?(r[c.key]==null||r[c.key]===''?null:Number(r[c.key])):(r[c.key]??'')))};}
 const cols=columns.invoices.filter(c=>c.key!=='amount');
 const headers=[...cols.map(c=>c.label),'Line amount','Invoice total','Balance'];
 const clients=new Map(data.clients.map(c=>[c.id,c.name]));const projects=new Map(data.projects.map(p=>[p.id,p.name]));
 const rows:Cell[][]=[];
 for(const inv of data.invoices){
  const state=invoiceState(inv,data.payments,current);const pays=data.payments.filter(p=>p.invoice_id===inv.id).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  const head:Record<string,Cell>={number:inv.number,name:inv.name,client:clients.get(inv.client_id)||'',project:projects.get(inv.project_id)||'',issue_date:inv.issue_date||null,due_date:inv.due_date||null,status:state.status,amount_paid:Number(state.paid)||0,payment_date:pays.at(-1)?.date||null,payment_method:pays.at(-1)?.method||'',discount:Number(inv.discount)||0,notes:inv.notes||'',payment_terms:inv.payment_terms||''};
  const items=(inv.items?.length?inv.items:[{service:'',description:'',quantity:0,rate:0,tax:0}]) as Row[];
  for(const it of items){
   const line:Record<string,Cell>={...head,service:it.service||'',item_description:it.description||'',quantity:Number(it.quantity)||0,unit:it.unit||'',rate:Number(it.rate)||0,tax:Number(it.tax)||0};
   rows.push([...cols.map(c=>line[c.key]??''),Math.round((Number(it.quantity)||0)*(Number(it.rate)||0)*100)/100,Number(state.total)||0,Number(state.balance)||0]);
  }
 }
 return {headers,rows};
}

/** A ready-to-fill template: the column headers plus one example row. */
export function templateTable(kind:ImportKind):{headers:string[];rows:Cell[][]}{
 const example:Record<ImportKind,Record<string,Cell>>={
  clients:{name:'Northstar Coffee',contact:'Sam Thomas',email:'sam@northstar.example',phone:'+91 98765 43210',billing_address:'Indiranagar, Bengaluru',tax_id:'29ABCDE1234F1Z5'},
  leads:{name:'Priya Kapoor',company:'Atelier Studio',email:'priya@atelier.example',phone:'+91 99887 66554',source:'Referral',service:'Brand launch film',budget:120000,status:'New',expected_date:'2026-11-20',notes:'Wants a launch film and social cutdowns.'},
  invoices:{number:'TS-00206',name:'October social content',client:'Northstar Coffee',project:'October social content',issue_date:'2026-10-01',due_date:'2026-10-15',status:'Paid',amount_paid:'',payment_date:'2026-10-10',payment_method:'Bank transfer',discount:0,notes:'',payment_terms:'50% advance, balance on delivery',service:'Social content production',item_description:'Three vertical reels',quantity:3,unit:'Reel',rate:15000,tax:18,amount:''},
 };
 const cols=columns[kind];return {headers:cols.map(c=>c.label),rows:[cols.map(c=>example[kind][c.key]??'')]};
}
