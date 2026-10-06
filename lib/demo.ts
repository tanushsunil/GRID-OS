import {emptyData,today,entities,type Data,type Row,totals,invoiceState} from './domain';
import {defaultExtras,presetsFromRentals} from './extras';
const uid=()=>crypto.randomUUID();
const day=(offset:number)=>{const d=new Date(today()+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+offset);return d.toISOString().slice(0,10);};
export function sampleActivity(state:any){
 const d=state.data;const [, riya, dev]=state.members;const ago=(mins:number)=>new Date(Date.now()-mins*60000).toISOString();const a=(x:Record<string,any>)=>({id:uid(),...x});
 const rows=[
  d.deliverables[1]&&riya&&a({entity:'deliverables',record_id:d.deliverables[1].id,project_id:d.deliverables[1].project_id,name:d.deliverables[1].name,action:'status',from:'Not Started',to:'In Progress',actor_id:riya.user_id,created_at:ago(35)}),
  d.tasks[0]&&dev&&a({entity:'tasks',record_id:d.tasks[0].id,project_id:d.tasks[0].project_id,name:d.tasks[0].name,action:'update',actor_id:dev.user_id,created_at:ago(90)}),
  d.shoots[1]&&dev&&a({entity:'shoots',record_id:d.shoots[1].id,project_id:d.shoots[1].project_id,name:d.shoots[1].name,action:'insert',actor_id:dev.user_id,created_at:ago(60*26)}),
  d.deliverables[4]&&riya&&a({entity:'deliverables',record_id:d.deliverables[4].id,project_id:d.deliverables[4].project_id,name:d.deliverables[4].name,action:'status',from:'Internal Review',to:'Client Review',actor_id:riya.user_id,created_at:ago(60*28)}),
  d.payments[0]&&a({entity:'payments',record_id:d.payments[0].id,name:d.invoices[0]?.number,action:'insert',actor_id:state.user.id,created_at:ago(60*24*9)}),
 ];
 return rows.filter(Boolean);
}
export function sampleRentals(state:any):Row[]{
 const d=state.data;const shoot=d.shoots[0];const second=d.shoots[1];const row=(x:Record<string,any>):Row=>({id:uid(),workspace_id:state.workspace?.id,created_at:new Date().toISOString(),...x});
 return [
  shoot&&row({name:'Sony FX3 cinema kit',category:'Camera',project_id:shoot.project_id,shoot_id:shoot.id,vendor:'Lens & Light Rentals',quantity:1,rate:6500,days:1,start_date:shoot.date,end_date:shoot.date,status:'Booked',reference:'LLR-2207'}),
  shoot&&row({name:'Aputure 600d lighting kit',category:'Lighting',project_id:shoot.project_id,shoot_id:shoot.id,vendor:'Lens & Light Rentals',quantity:2,rate:2200,days:1,start_date:shoot.date,end_date:shoot.date,status:'Booked'}),
  shoot&&row({name:'DJI RS 3 Pro gimbal',category:'Grip',project_id:shoot.project_id,shoot_id:shoot.id,vendor:'Frame Gear Co.',quantity:1,rate:1800,days:1,start_date:shoot.date,end_date:shoot.date,status:'Requested'}),
  second&&row({name:'ARRI Alexa Mini LF package',category:'Camera',project_id:second.project_id,shoot_id:second.id,vendor:'Cine Hire Bengaluru',quantity:1,rate:28000,days:2,start_date:second.date,end_date:day(daysFrom(second.date,1)),status:'Requested',notes:'Includes 3 Signature Primes'}),
 ].filter(Boolean) as Row[];
}
const daysFrom=(date:string,n:number)=>Math.round((Date.parse(date+'T12:00:00Z')-Date.parse(today()+'T12:00:00Z'))/86400000)+n;
export function demoWorkspace(){
 const data=emptyData();const user={id:uid(),email:'alex@grid.example'};const w={id:uid(),name:'GRID Studio',currency:'INR',timezone:'Asia/Kolkata',billing_address:'Bengaluru, Karnataka',tax_id:''};
 const members=[{id:uid(),user_id:user.id,role:'Admin',profile:{name:'Alex Morgan',email:user.email}},{id:uid(),user_id:uid(),role:'Editor',profile:{name:'Riya Shah',email:'riya@grid.example'}},{id:uid(),user_id:uid(),role:'Manager',profile:{name:'Dev Patel',email:'dev@grid.example'}}];
 const row=(x:Record<string,any>):Row=>({id:uid(),workspace_id:w.id,created_at:new Date().toISOString(),...x});
 data.clients=[row({name:'Epic Athletic',contact:'Arjun Mehta',email:'arjun@epic.example',phone:'+91 98765 43210',billing_address:'Indiranagar, Bengaluru',tax_id:''}),row({name:'Forma Living',contact:'Nisha Rao',email:'nisha@forma.example'}),row({name:'Northstar Coffee',contact:'Sam Thomas',email:'sam@northstar.example'})];
 data.projects=[row({name:'October Social Media Content',client_id:data.clients[0].id,project_type:'Social content',owner_id:user.id,status:'Editing',cost:28000,start_date:day(-10),deadline:day(7),brief:'Create a high-energy content series showcasing the facility, strength training and MMA.\n\nAudience\nFitness enthusiasts aged 20–35.\n\nDirection\nAuthentic training. Natural light. Fast, intentional cuts.\n\nDelivery\nThree vertical reels, 30–45 seconds each.'}),row({name:'Spaces that feel like home',client_id:data.clients[1].id,project_type:'Campaign film',owner_id:members[2].user_id,status:'Pre-production',start_date:day(-3),deadline:day(14),brief:'A thoughtful brand film featuring the new collection in lived-in spaces.'}),row({name:'The morning ritual',client_id:data.clients[2].id,project_type:'Photography',owner_id:user.id,status:'Client Review',start_date:day(-18),deadline:day(3),brief:'Product and lifestyle photography for the seasonal coffee launch.'})];
 data.deliverables=[row({name:'Coming Soon Reel',project_id:data.projects[0].id,type:'Reel',assignee_id:members[1].user_id,due_date:day(1),status:'Internal Review',revision_count:0}),row({name:'Strength Training Reel',project_id:data.projects[0].id,type:'Reel',assignee_id:members[1].user_id,due_date:day(3),status:'In Progress',revision_count:0}),row({name:'MMA Reel',project_id:data.projects[0].id,type:'Reel',assignee_id:members[1].user_id,due_date:day(5),status:'Not Started',revision_count:0}),row({name:'Campaign film',project_id:data.projects[1].id,type:'Film',assignee_id:user.id,due_date:day(12),status:'Not Started',revision_count:0}),row({name:'20 product photographs',project_id:data.projects[2].id,type:'Photography',assignee_id:user.id,due_date:day(2),status:'Client Review',revision_count:1})];
 data.tasks=[row({name:'Prepare shot list',project_id:data.projects[1].id,assignee_id:members[2].user_id,priority:'High',due_date:day(0),status:'In Progress'}),row({name:'Review the first cut',project_id:data.projects[0].id,deliverable_id:data.deliverables[0].id,assignee_id:user.id,priority:'High',due_date:day(-1),status:'Review'}),row({name:'Strength training rough cut',project_id:data.projects[0].id,assignee_id:members[1].user_id,priority:'Medium',due_date:day(1),status:'In Progress'}),row({name:'Collect client feedback',project_id:data.projects[2].id,assignee_id:members[2].user_id,priority:'Medium',due_date:day(0),status:'To Do'}),row({name:'Final export',project_id:data.projects[0].id,assignee_id:members[1].user_id,priority:'Medium',due_date:day(6),status:'To Do'}),row({name:'Shoot footage',project_id:data.projects[0].id,assignee_id:user.id,priority:'High',due_date:day(-3),status:'Done'})];
 data.shoots=[row({name:'Athletic Facility Content Shoot',project_id:data.projects[0].id,date:day(1),start_time:'07:00',end_time:'11:00',location:'Epic Athletic, Indiranagar',shoot_type:'Social content',crew:'Alex, Riya',status:'Confirmed',equipment:'Sony FX3 + 24-70mm\nGimbal\n2× LED panels\nWireless lav mics\nSpare batteries & cards',shot_notes:'Wide establishing shots of the facility\nStrength training close-ups\nMMA sparring slow motion\nCoach interview (5 min)\nMember testimonials',notes:'Facility opens at 6:30. Parking at the rear entrance.'}),row({name:'Forma interiors — location shoot',project_id:data.projects[1].id,date:day(3),start_time:'09:30',end_time:'16:00',location:'Forma House, Whitefield',shoot_type:'Brand film',crew:'Dev, Alex',status:'Planned'})];
 data.leads=[row({name:'Priya Kapoor',company:'Atelier Studio',service:'Brand launch campaign',source:'Referral',email:'priya@atelier.example',budget:120000,status:'New',notes:'Looking for a launch film and social cutdowns.',expected_date:day(20)})];
 data.estimates=[row({name:'October Social Media Content',number:'EST-00001',client_id:data.clients[0].id,issue_date:day(-15),valid_until:day(5),discount:0,status:'Accepted',items:[{service:'Social content production',description:'Three vertical reels',quantity:3,rate:15000,tax:18}],payment_terms:'50% advance, balance on delivery.'})];data.projects[0].estimate_id=data.estimates[0].id;
 data.invoices=[row({name:'October Social Media Content',number:'INV-00001',client_id:data.clients[0].id,project_id:data.projects[0].id,issue_date:day(-10),due_date:day(-2),discount:0,status:'Sent',items:data.estimates[0].items,payment_terms:'Balance on delivery.'})];
 data.payments=[row({invoice_id:data.invoices[0].id,amount:26550,date:day(-9),method:'Bank transfer',reference:'DEMO-ADVANCE'})];
 const state={data,workspace:w,user,members,role:'Admin',activity:[] as any[],projectMembers:[] as any[],memberships:[] as any[]};state.activity=sampleActivity(state);data.rentals=sampleRentals(state);return state;
}
export const DEMO_KEY='grid-os-demo-v1';
/** The activity log is trimmed to this many entries so browser storage can't fill up over months of use. */
export const MAX_ACTIVITY=1000;
const KEEP_CORRUPT=3;
/** Bring any stored demo workspace (old or partial) up to the current shape. Safe to run repeatedly. */
export function migrateDemo(raw:any){
 const hadGear=Array.isArray(raw?.extras?.gearCatalog);
 const state=raw&&typeof raw==='object'?raw:demoWorkspace();
 const stored=state.data&&typeof state.data==='object'?state.data:{};
 const hadRentals='rentals' in stored;
 state.data={...emptyData(),...stored};
 for(const e of entities)if(!Array.isArray(state.data[e]))state.data[e]=[];
 for(const k of ['members','activity','projectMembers','memberships'])if(!Array.isArray(state[k]))state[k]=[];
 if(!hadRentals)state.data.rentals=sampleRentals(state);
 if(!state.extras||typeof state.extras!=='object'){state.extras=defaultExtras();if(!state.activity.length)state.activity=sampleActivity(state);}
 state.extras={...defaultExtras(),...state.extras};
 if(!hadGear)state.extras.gearCatalog=presetsFromRentals(state.data.rentals);
 // drop entries that aren't records (e.g. null from a bad edit) so one broken row can't crash a page
 for(const e of entities)state.data[e]=state.data[e].filter((r:any)=>r&&typeof r==='object'&&typeof r.id==='string');
 if(state.activity.length>MAX_ACTIVITY)state.activity=state.activity.slice(0,MAX_ACTIVITY);
 return state;
}
/** Read the demo workspace from storage. Corrupted data is set aside (never deleted) and a fresh demo starts. */
export function loadDemo(storage:Pick<Storage,'getItem'|'setItem'>):{state:any;recovered:boolean}{
 let text:string|null=null;try{text=storage.getItem(DEMO_KEY);}catch{return {state:migrateDemo(null),recovered:false};}
 if(!text)return {state:migrateDemo(null),recovered:false};
 try{const parsed=JSON.parse(text);if(!parsed||typeof parsed!=='object'||!parsed.workspace||!parsed.user)throw Error('Invalid demo workspace');return {state:migrateDemo(parsed),recovered:false};}
 catch{try{storage.setItem(`${DEMO_KEY}-corrupt-${Date.now()}`,text);}catch{}pruneCorrupt(storage as Storage);return {state:migrateDemo(null),recovered:true};}
}
/** Keep only the newest few set-aside copies of unreadable data. */
function pruneCorrupt(storage:Storage){
 try{if(typeof storage.length!=='number'||typeof storage.key!=='function')return;
  const keys:string[]=[];for(let i=0;i<storage.length;i++){const k=storage.key(i);if(k?.startsWith(`${DEMO_KEY}-corrupt-`))keys.push(k);}
  keys.sort().slice(0,-KEEP_CORRUPT).forEach(k=>storage.removeItem(k));}catch{}
}
/** Write the demo workspace; throws a clear message when the browser blocks or runs out of storage. */
export function saveDemo(storage:Pick<Storage,'setItem'>,state:any){
 if(Array.isArray(state.activity)&&state.activity.length>MAX_ACTIVITY)state.activity=state.activity.slice(0,MAX_ACTIVITY);
 const text=JSON.stringify(state);
 try{storage.setItem(DEMO_KEY,text);return;}catch{}
 // Out of room: clear our own set-aside copies, then try once more before giving up.
 try{const s=storage as Storage;const old:string[]=[];for(let i=0;i<s.length;i++){const k=s.key(i);if(k?.startsWith(`${DEMO_KEY}-corrupt-`))old.push(k);}old.forEach(k=>s.removeItem(k));storage.setItem(DEMO_KEY,text);return;}catch{}
 throw Error('Could not save: browser storage is full or blocked. Download a backup from Settings, free up space or allow site data, then try again.');
}
/** A downloadable backup of the demo workspace, and the matching restore (validated before anything is replaced). */
export const backupFile=(state:any)=>JSON.stringify({app:'grid-os',kind:'demo-backup',version:1,saved_at:new Date().toISOString(),state},null,1);
export function readBackup(text:string){
 let parsed:any;try{parsed=JSON.parse(text);}catch{throw Error('That file isn’t a GRID OS backup.');}
 const state=parsed?.app==='grid-os'&&parsed?.state?parsed.state:parsed;
 if(!state||typeof state!=='object'||!state.workspace||!state.user||!state.data||typeof state.data!=='object')throw Error('That file isn’t a GRID OS backup.');
 return migrateDemo(state);
}
export function demoAction(state:any,body:any){const data:Data=state.data;const {action,id}=body;
 if(action==='convert_estimate'){const e=data.estimates.find(x=>x.id===id);if(!e||e.status!=='Accepted')throw Error('Accept the estimate first.');let p=data.projects.find(x=>x.estimate_id===id);if(!p){p={id:uid(),name:e.name,client_id:e.client_id,estimate_id:id,status:'Planning',brief:e.notes||'',start_date:today()};data.projects.unshift(p);}return p.id;}
 if(action==='convert_lead'){const l=data.leads.find(x=>x.id===id);if(!l)throw Error('This lead no longer exists.');if(!l.client_id){const c={id:uid(),name:l.company||l.name,contact:l.name,email:l.email,phone:l.phone};data.clients.unshift(c);l.client_id=c.id;}let p=data.projects.find(x=>x.lead_id===id);if(body.make_project&&!p){if(l.status!=='Won')throw Error('Mark the lead Won first.');p={id:uid(),name:l.service||l.name,client_id:l.client_id,lead_id:id,status:'Planning',brief:l.notes};data.projects.unshift(p);}return {client_id:l.client_id,project_id:p?.id};}
 if(action==='invoice_status'){const i=data.invoices.find(x=>x.id===id);if(!i)throw Error('This invoice no longer exists.');if(!['Sent','Cancelled'].includes(body.status))throw Error('Choose a valid invoice status.');if(data.payments.some(p=>p.invoice_id===id)&&body.status==='Cancelled')throw Error('Invoices with payments cannot be cancelled.');i.status=body.status;return id;}
 if(action==='workspace'){const name=String(body.data?.name??'').trim();if(!name||name.length>100)throw Error('Enter a workspace name (up to 100 characters).');Object.assign(state.workspace,{name,billing_address:String(body.data?.billing_address??'').slice(0,1000),tax_id:String(body.data?.tax_id??'').slice(0,100)});return state.workspace;}
 if(action==='assign'){state.projectMembers=state.projectMembers.filter((x:any)=>!(x.project_id===body.project_id&&x.user_id===body.user_id));if(!body.remove)state.projectMembers.push({id:uid(),project_id:body.project_id,user_id:body.user_id});return true;}
 throw Error('Connect a live workspace to manage team accounts.');
}
export function validateDemoSave(data:Data,entity:string,r:Row){
 if(entity==='payments'){const inv=data.invoices.find(x=>x.id===r.invoice_id);if(!inv||inv.status!=='Sent')throw Error('Send the invoice before recording payment.');if(data.payments.some(p=>p.id===r.id))throw Error('This payment is already recorded.');if(r.amount>invoiceState(inv,data.payments).balance)throw Error('Payment exceeds the outstanding balance.');}
 if(entity==='invoices'){const old=data.invoices.find(x=>x.id===r.id);if(old&&old.status!=='Draft')throw Error('Issued invoices are locked.');const project=data.projects.find(x=>x.id===r.project_id);if(project?.client_id!==r.client_id)throw Error('The project and client must match.');}
 if(['invoices','estimates'].includes(entity)&&r.discount>totals(r.items).subtotal)throw Error('Discount cannot exceed subtotal.');
 if(r.shoot_id&&!data.shoots.some(s=>s.id===r.shoot_id&&s.project_id===r.project_id))throw Error('Choose a shoot from this project.');
 if(r.deliverable_id&&!data.deliverables.some(d=>d.id===r.deliverable_id&&d.project_id===r.project_id))throw Error('Choose a deliverable from this project.');
}
