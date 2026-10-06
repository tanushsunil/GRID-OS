import {invoiceStates,money,displayDate,terminal,singular,type Data,type Entity,type Row} from './domain';

/* ---------- Workspace extras (templates, reminders, notification state) ---------- */
export type TemplateStep={name:string;offset:number;priority?:string;type?:string};
export type ProjectTemplate={id:string;name:string;project_type:string;duration:number;brief:string;deliverables:TemplateStep[];tasks:TemplateStep[];shoots:(TemplateStep&{start_time:string;end_time:string})[]};
export type ReminderSettings={enabled:boolean;before:number;onDue:boolean;every:number};
export type ReminderLog={id:string;invoice_id:string;stage:string;sent_at:string};
export type GearPreset={id:string;name:string;category?:string;vendor?:string;rate:number;quantity:number};
export type Extras={templates:ProjectTemplate[];reminders:ReminderSettings;reminderLog:ReminderLog[];readNotifications:string[];gearCatalog:GearPreset[]};
export type Activity={id:string;entity:Entity|'reminders';record_id:string;project_id?:string;action:string;name?:string;actor_id?:string;from?:string;to?:string;field?:string;created_at:string};

export const defaultTemplates:ProjectTemplate[]=[
 {id:'tpl-social',name:'Social content retainer',project_type:'Social content',duration:30,brief:'Monthly social content for the brand.\n\nAudience\n\nDirection\n\nDelivery\nVertical reels and stills, platform-ready.',
  shoots:[{name:'Monthly content shoot',offset:7,start_time:'08:00',end_time:'13:00'}],
  deliverables:[{name:'Reel 1',type:'Reel',offset:14},{name:'Reel 2',type:'Reel',offset:18},{name:'Reel 3',type:'Reel',offset:22},{name:'Photo set',type:'Photography',offset:20}],
  tasks:[{name:'Content calendar & concepts',priority:'High',offset:3},{name:'Shot list',priority:'High',offset:5},{name:'Edit first cuts',priority:'Medium',offset:13},{name:'Client review round',priority:'Medium',offset:24},{name:'Final exports & captions',priority:'Medium',offset:28}]},
 {id:'tpl-film',name:'Brand film',project_type:'Brand film',duration:45,brief:'A brand film that tells the story behind the work.\n\nObjective\n\nKey message\n\nDeliverables\nHero film plus social cutdowns.',
  shoots:[{name:'Principal photography',offset:18,start_time:'07:00',end_time:'18:00'}],
  deliverables:[{name:'Hero film (60–90s)',type:'Film',offset:35},{name:'Social cutdown 15s',type:'Reel',offset:38},{name:'Social cutdown 30s',type:'Reel',offset:38},{name:'Stills',type:'Photography',offset:30}],
  tasks:[{name:'Treatment & moodboard',priority:'High',offset:5},{name:'Location recce',priority:'Medium',offset:10},{name:'Casting & crew booking',priority:'High',offset:12},{name:'Rough cut',priority:'High',offset:26},{name:'Colour & sound',priority:'Medium',offset:32},{name:'Final delivery',priority:'High',offset:42}]},
 {id:'tpl-photo',name:'Product photography',project_type:'Photography',duration:14,brief:'Product and lifestyle photography.\n\nProducts\n\nStyle\n\nUsage\nWebsite, marketplace and social.',
  shoots:[{name:'Studio shoot',offset:4,start_time:'09:00',end_time:'17:00'}],
  deliverables:[{name:'Edited product photographs',type:'Photography',offset:10},{name:'Lifestyle selects',type:'Photography',offset:11}],
  tasks:[{name:'Product list & shot list',priority:'High',offset:1},{name:'Props & styling',priority:'Medium',offset:3},{name:'Culling & retouching',priority:'High',offset:8},{name:'Client selects',priority:'Medium',offset:12}]},
];
export const defaultExtras=():Extras=>({templates:defaultTemplates,reminders:{enabled:true,before:3,onDue:true,every:7},reminderLog:[],readNotifications:[],gearCatalog:[]});
/** Build a starting gear list from rentals already booked (one entry per item name). */
export const presetsFromRentals=(rentals:Row[]):GearPreset[]=>[...new Map(rentals.filter(r=>r.name&&r.status!=='Cancelled').map(r=>[r.name.trim().toLowerCase(),{id:'gear-'+r.id,name:r.name.trim(),category:r.category||undefined,vendor:r.vendor||undefined,rate:Number(r.rate)||0,quantity:Number(r.quantity)||1}])).values()];

/* ---------- Dates ---------- */
export const addDays=(date:string,n:number)=>{const d=new Date(date.slice(0,10)+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
export const daysBetween=(from:string,to:string)=>Math.round((Date.parse(to.slice(0,10)+'T12:00:00Z')-Date.parse(from.slice(0,10)+'T12:00:00Z'))/86400000);

/* ---------- Payment reminders ---------- */
export type DueReminder={key:string;invoice:Row;stage:string;label:string;tone:'info'|'warning'|'critical';balance:number;email?:string;contact?:string;subject:string;body:string;mailto:string};
export function dueReminders(data:Data,extras:Extras,current:string,workspaceName:string):DueReminder[]{
 const s=extras.reminders;if(!s.enabled)return [];
 const out:DueReminder[]=[];const states=invoiceStates(data,current);const clients=new Map(data.clients.map(c=>[c.id,c]));
 for(const invoice of data.invoices){
  const st=states.get(invoice.id)!;
  if(['Draft','Cancelled','Paid'].includes(st.status)||st.balance<=0||!invoice.due_date)continue;
  const days=daysBetween(invoice.due_date,current);
  let stage='';let label='';let tone:DueReminder['tone']='info';
  if(days<0&&-days<=s.before){stage='before';label=`Due in ${-days} day${days===-1?'':'s'}`;}
  else if(days>=0&&days<s.every&&s.onDue){stage='due';label=days===0?'Due today':`Overdue ${days} day${days===1?'':'s'}`;tone='warning';}
  else if(days>=s.every){stage='overdue-'+Math.floor(days/s.every);label=`Overdue ${days} days`;tone='critical';}
  if(!stage||extras.reminderLog.some(l=>l.invoice_id===invoice.id&&l.stage===stage))continue;
  const client=clients.get(invoice.client_id);
  const amount=money(st.balance);const due=displayDate(invoice.due_date);const hello=client?.contact?`Hi ${client.contact.split(' ')[0]},`:'Hello,';
  const subject=stage==='before'?`Upcoming payment: ${invoice.number} (${amount} due ${due})`:`Payment reminder: ${invoice.number} — ${amount} ${days>0?'overdue':'due today'}`;
  const body=stage==='before'
   ?`${hello}\n\nA quick note that invoice ${invoice.number} for “${invoice.name}” is due on ${due}. The outstanding balance is ${amount}.\n\nPlease let us know if you need anything from our side.\n\nThank you,\n${workspaceName}`
   :days>0
   ?`${hello}\n\nOur records show invoice ${invoice.number} for “${invoice.name}” was due on ${due} and ${amount} is still outstanding (${days} day${days===1?'':'s'} overdue).\n\nCould you share an expected payment date? If it has already been paid, please send the reference and we will update our records.\n\nThank you,\n${workspaceName}`
   :`${hello}\n\nInvoice ${invoice.number} for “${invoice.name}” is due today. The outstanding balance is ${amount}.\n\nThank you,\n${workspaceName}`;
  const mailto=`mailto:${encodeURIComponent(client?.email||'')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  out.push({key:invoice.id+':'+stage,invoice,stage,label,tone,balance:st.balance,email:client?.email,contact:client?.contact,subject,body,mailto});
 }
 return out.sort((a,b)=>a.invoice.due_date.localeCompare(b.invoice.due_date));
}

/* ---------- Calendar export ---------- */
export type CalendarEvent={uid:string;title:string;date:string;start?:string;end?:string;location?:string;description?:string;url?:string};
const icsText=(s='')=>s.replace(/\\/g,'\\\\').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/\r?\n/g,'\\n');
const utf8=new TextEncoder();
// RFC 5545: lines are folded at 75 octets, never splitting a character
const fold=(line:string)=>{const out:string[]=[];let chunk='';let size=0;for(const ch of line){const n=utf8.encode(ch).length;if(size+n>(out.length?74:75)){out.push(chunk);chunk='';size=0;}chunk+=ch;size+=n;}out.push(chunk);return out.join('\r\n ');};
const compact=(date:string,time?:string)=>date.replaceAll('-','')+(time?'T'+time.slice(0,5).replace(':','')+'00':'');
export function calendarEvents(data:Data,origin:string,kinds:string[]=['shoots','projects','deliverables','tasks']):CalendarEvent[]{
 const project=(r:Row)=>data.projects.find(p=>p.id===r.project_id)?.name;
 const events:CalendarEvent[]=[];
 if(kinds.includes('shoots'))data.shoots.filter(s=>s.status!=='Cancelled'&&s.date).forEach(s=>events.push({uid:'shoot-'+s.id,title:`🎬 ${s.name}`,date:s.date,start:s.start_time,end:s.end_time||undefined,location:s.location,description:[project(s)&&`Project: ${project(s)}`,s.crew&&`Crew: ${s.crew}`,s.equipment&&`Equipment: ${s.equipment}`,s.notes].filter(Boolean).join('\n'),url:`${origin}/shoots/${s.id}`}));
 if(kinds.includes('projects'))data.projects.filter(p=>p.deadline&&!terminal(p.status)).forEach(p=>events.push({uid:'project-'+p.id,title:`Deadline: ${p.name}`,date:p.deadline,url:`${origin}/projects/${p.id}`}));
 if(kinds.includes('deliverables'))data.deliverables.filter(d=>d.due_date&&!terminal(d.status)).forEach(d=>events.push({uid:'deliverable-'+d.id,title:`Due: ${d.name}`,date:d.due_date,description:project(d)&&`Project: ${project(d)}`,url:`${origin}/deliverables/${d.id}`}));
 if(kinds.includes('tasks'))data.tasks.filter(t=>t.due_date&&t.status!=='Done').forEach(t=>events.push({uid:'task-'+t.id,title:`Task: ${t.name}`,date:t.due_date,description:project(t)&&`Project: ${project(t)}`,url:`${origin}/tasks/${t.id}`}));
 return events;
}
export function toICS(events:CalendarEvent[],tz:string,calName='GRID OS'){
 const stamp=new Date().toISOString().replace(/[-:]/g,'').slice(0,15)+'Z';
 const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//GRID OS//EN','CALSCALE:GREGORIAN','METHOD:PUBLISH',`X-WR-CALNAME:${icsText(calName)}`,`X-WR-TIMEZONE:${tz}`];
 for(const e of events){
  lines.push('BEGIN:VEVENT',`UID:${e.uid}@grid-os`,`DTSTAMP:${stamp}`);
  if(e.start){lines.push(`DTSTART;TZID=${tz}:${compact(e.date,e.start)}`,`DTEND;TZID=${tz}:${compact(e.date,e.end||addHour(e.start))}`);}
  else{lines.push(`DTSTART;VALUE=DATE:${compact(e.date)}`,`DTEND;VALUE=DATE:${compact(addDays(e.date,1))}`);}
  lines.push(`SUMMARY:${icsText(e.title)}`);
  if(e.location)lines.push(`LOCATION:${icsText(e.location)}`);
  if(e.description||e.url)lines.push(`DESCRIPTION:${icsText([e.description,e.url].filter(Boolean).join('\n\n'))}`);
  if(e.url)lines.push(`URL:${e.url}`);
  lines.push('END:VEVENT');
 }
 lines.push('END:VCALENDAR');
 return lines.map(fold).join('\r\n')+'\r\n';
}
const addHour=(t:string)=>{const [h,m]=t.split(':').map(Number);return `${String(Math.min(h+1,23)).padStart(2,'0')}:${String(m).padStart(2,'0')}`;};
export function googleCalendarUrl(e:CalendarEvent,tz:string){
 const dates=e.start?`${compact(e.date,e.start)}/${compact(e.date,e.end||addHour(e.start))}`:`${compact(e.date)}/${compact(addDays(e.date,1))}`;
 const q=new URLSearchParams({action:'TEMPLATE',text:e.title,dates,ctz:tz,details:[e.description,e.url].filter(Boolean).join('\n\n'),location:e.location||''});
 return 'https://calendar.google.com/calendar/render?'+q.toString();
}
export function downloadFile(name:string,content:BlobPart,type='text/calendar;charset=utf-8'){
 const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

/* ---------- Activity ---------- */
export function describeActivity(a:Activity,actorName:string){
 const what=a.entity==='reminders'?'payment reminder':singular[a.entity as Entity]||'record';
 const name=a.name?`“${a.name}”`:`a ${what}`;const of=a.name?`${what} ${name}`:name;
 switch(a.action){
  case 'insert':return a.entity==='payments'?`${actorName} recorded a payment${a.name?` for ${a.name}`:''}`:`${actorName} created ${of}`;
  case 'status':return `${actorName} moved ${name} to ${a.to}`;
  case 'reschedule':return `${actorName} rescheduled ${name} to ${a.to?displayDate(a.to):'a new date'}`;
  case 'delete':return `${actorName} deleted ${of}`;
  case 'sent':return `${actorName} sent a payment reminder for ${a.name}`;
  case 'template':return `${actorName} created project ${name} from the “${a.to}” template`;
  default:return `${actorName} updated ${of}`;
 }
}
export const activityHref=(a:Activity)=>a.action==='delete'?undefined:a.entity==='reminders'?`/invoices/${a.record_id}`:`/${a.entity}/${a.record_id}`;
export const activityGroup=(a:Activity)=>['invoices','payments','estimates','reminders'].includes(a.entity)?'Finance':a.entity==='projects'?'Projects':['tasks','deliverables'].includes(a.entity)?'Production':['shoots','rentals'].includes(a.entity)?'Shoots':'Relationships';
export const relativeTime=(iso:string)=>{const s=(Date.now()-Date.parse(iso))/1000;if(s<60)return 'Just now';if(s<3600)return `${Math.floor(s/60)}m ago`;if(s<86400)return `${Math.floor(s/3600)}h ago`;if(s<604800)return `${Math.floor(s/86400)}d ago`;return new Date(iso).toLocaleDateString('en-IN',{day:'numeric',month:'short'});};

/* ---------- Notifications ---------- */
export type Notification={id:string;title:string;text:string;href:string;tone:'info'|'warning'|'critical'|'success';kind:string;date:string};
export function buildNotifications(data:Data,extras:Extras,activity:Activity[],opts:{userId:string;manager:boolean;current:string;workspaceName:string;nameOf:(id?:string)=>string;reminders?:DueReminder[]}):Notification[]{
 const {userId,manager,current}=opts;const tomorrow=addDays(current,1);const out:Notification[]=[];
 const projects=new Map(data.projects.map(p=>[p.id,p.name]));const project=(r:Row)=>projects.get(r.project_id)||'Project';
 for(const t of data.tasks){
  if(t.status==='Done'||!t.due_date||(t.assignee_id!==userId&&!(manager&&t.priority==='Urgent')))continue;
  if(t.due_date<current)out.push({id:`task-overdue-${t.id}-${t.due_date}`,kind:'Tasks',title:`Overdue: ${t.name}`,text:`${project(t)} · was due ${displayDate(t.due_date)}`,href:`/tasks/${t.id}`,tone:'critical',date:t.due_date});
  else if(t.due_date<=tomorrow)out.push({id:`task-due-${t.id}-${t.due_date}`,kind:'Tasks',title:`${t.due_date===current?'Due today':'Due tomorrow'}: ${t.name}`,text:project(t),href:`/tasks/${t.id}`,tone:'warning',date:t.due_date});
 }
 for(const d of data.deliverables){
  if(terminal(d.status)||!d.due_date||(d.assignee_id!==userId&&!manager)||d.due_date>tomorrow)continue;
  out.push({id:`deliverable-${d.id}-${d.due_date}`,kind:'Deliverables',title:`${d.due_date<current?'Overdue':d.due_date===current?'Due today':'Due tomorrow'}: ${d.name}`,text:project(d),href:`/deliverables/${d.id}`,tone:d.due_date<current?'critical':'warning',date:d.due_date});
 }
 for(const s of data.shoots){
  if(['Completed','Cancelled'].includes(s.status)||(s.date!==current&&s.date!==tomorrow))continue;
  out.push({id:`shoot-${s.id}-${s.date}`,kind:'Shoots',title:`Shoot ${s.date===current?'today':'tomorrow'}: ${s.name}`,text:`Call ${s.start_time?.slice(0,5)||'TBC'} · ${s.location||'Location TBC'}`,href:`/shoots/${s.id}`,tone:'info',date:s.date});
 }
 if(manager){
  for(const r of opts.reminders??dueReminders(data,extras,current,opts.workspaceName))out.push({id:`reminder-${r.key}`,kind:'Payments',title:`Send reminder: ${r.invoice.number}`,text:`${money(r.balance)} · ${r.label}`,href:`/invoices/${r.invoice.id}`,tone:r.tone,date:r.invoice.due_date});
  for(const r of data.rentals||[]){
   if(['Requested','Booked'].includes(r.status)&&r.start_date&&r.start_date>=current&&r.start_date<=tomorrow)out.push({id:`rental-pickup-${r.id}-${r.start_date}`,kind:'Rentals',title:`Pickup ${r.start_date===current?'today':'tomorrow'}: ${r.name}`,text:`${r.vendor||'Rental'} · ${r.status}`,href:`/rentals/${r.id}`,tone:r.status==='Requested'?'warning':'info',date:r.start_date});
   if(r.status==='Picked Up'&&r.end_date&&r.end_date<=current)out.push({id:`rental-return-${r.id}-${r.end_date}`,kind:'Rentals',title:`${r.end_date<current?'Overdue return':'Return today'}: ${r.name}`,text:r.vendor||'Rental gear',href:`/rentals/${r.id}`,tone:r.end_date<current?'critical':'warning',date:r.end_date});
  }
  for(const l of data.leads.filter(l=>l.status==='New'))out.push({id:`lead-${l.id}`,kind:'Leads',title:`New enquiry: ${l.company||l.name}`,text:l.service||'Respond to this lead',href:`/leads/${l.id}`,tone:'info',date:(l.created_at||current).slice(0,10)});
 }
 for(const a of activity.slice(0,30)){
  if(!a.actor_id||a.actor_id===userId)continue;
  out.push({id:`activity-${a.id}`,kind:'Team',title:describeActivity(a,opts.nameOf(a.actor_id)),text:relativeTime(a.created_at),href:activityHref(a)||'/activity',tone:'success',date:a.created_at.slice(0,10)});
 }
 const rank={critical:0,warning:1,info:2,success:3};
 return out.sort((a,b)=>rank[a.tone]-rank[b.tone]||a.date.localeCompare(b.date));
}
