'use client';
import {Printer,Mail,CalendarPlus,Download,MapPin,ArrowLeft,Copy} from 'lucide-react';
import {displayDate,type Data,type Row} from '@/lib/domain';
const rentalLine=(r:Row)=>`${Number(r.quantity)>1?`${r.quantity}× `:''}${r.name}${r.vendor?` — ${r.vendor}`:''}`;
import {calendarEvents,toICS,googleCalendarUrl,downloadFile} from '@/lib/extras';

type Member={user_id:string;role:string;profile?:{name?:string;email?:string}};
const lines=(s?:string)=>(s||'').split(/\r?\n|;/).map(x=>x.replace(/^[-•*\d.)\s]+/,'').trim()).filter(Boolean);
const minus=(t:string|undefined,mins:number)=>{if(!t)return '';const [h,m]=t.split(':').map(Number);const total=Math.max(0,h*60+m-mins);return `${String(Math.floor(total/60)).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`;};

export default function CallSheet({shoot,data,workspace,members,assigned,onBack,notify}:{shoot:Row;data:Data;workspace:any;members:Member[];assigned:string[];onBack:()=>void;notify:(m:string)=>void}){
 const project=data.projects.find(p=>p.id===shoot.project_id);const client=data.clients.find(c=>c.id===project?.client_id);
 const crewNames=(shoot.crew||'').split(/[,&\n]|\band\b/).map((x:string)=>x.trim()).filter(Boolean);
 const matched=(name:string)=>members.find(m=>m.profile?.name?.toLowerCase().split(' ')[0]===name.toLowerCase().split(' ')[0]);
 type CrewRow={name:string;role:string;email?:string};
 const crew:CrewRow[]=[...new Map<string,CrewRow>([
  ...members.filter(m=>assigned.includes(m.user_id)||m.user_id===project?.owner_id).map(m=>[m.user_id,{name:m.profile?.name||'Team member',role:m.user_id===project?.owner_id?'Producer':m.role,email:m.profile?.email}] as const),
  ...crewNames.map((n:string)=>{const m=matched(n);return [m?.user_id||n,{name:m?.profile?.name||n,role:m?(m.user_id===project?.owner_id?'Producer':m.role):'Crew',email:m?.profile?.email}] as const;}),
 ]).values()];
 const call=minus(shoot.start_time,30);
 const rented=(data.rentals||[]).filter(r=>r.shoot_id===shoot.id&&r.status!=='Cancelled');
 const event=calendarEvents({...data,shoots:[shoot]},typeof window==='undefined'?'':window.location.origin,['shoots'])[0];
 const maps=shoot.location?`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(shoot.location)}`:'';
 const summary=[`CALL SHEET — ${shoot.name}`,`${displayDate(shoot.date)} · Crew call ${call||'TBC'} · Shoot ${shoot.start_time?.slice(0,5)||'TBC'}–${shoot.end_time?.slice(0,5)||'TBC'}`,`Location: ${shoot.location||'TBC'}${maps?`\n${maps}`:''}`,project&&`Project: ${project.name}${client?` (${client.name})`:''}`,client?.contact&&`Client contact: ${client.contact}${client.phone?` · ${client.phone}`:''}`,crew.length&&`Crew: ${crew.map(c=>`${c.name} (${c.role})`).join(', ')}`,(shoot.equipment||rented.length)&&`Equipment:\n${[...lines(shoot.equipment),...rented.map(r=>`${rentalLine(r)} (rental)`)].map(l=>`• ${l}`).join('\n')}`,shoot.shot_notes&&`Shot list:\n${lines(shoot.shot_notes).map((l,i)=>`${i+1}. ${l}`).join('\n')}`,shoot.notes&&`Notes: ${shoot.notes}`].filter(Boolean).join('\n\n');
 const emails=crew.map(c=>c.email).filter(Boolean).join(',');
 const mailto=`mailto:${encodeURIComponent(emails)}?subject=${encodeURIComponent(`Call sheet: ${shoot.name} — ${displayDate(shoot.date)}`)}&body=${encodeURIComponent(summary)}`;

 return <>
  <div className="document-actions call-sheet-actions">
   <button className="button" onClick={onBack}><ArrowLeft size={15}/>Back to shoot</button>
   <button className="button primary" onClick={()=>window.print()}><Printer size={15}/>Print / PDF</button>
   <a className="button" href={mailto}><Mail size={15}/>Email crew</a>
   <button className="button" onClick={async()=>{try{await navigator.clipboard.writeText(summary);notify('Call sheet copied');}catch{notify('Copy is not available in this browser');}}}><Copy size={15}/>Copy text</button>
   <a className="button" href={googleCalendarUrl(event,workspace.timezone)} target="_blank" rel="noreferrer"><CalendarPlus size={15}/>Google Calendar</a>
   <button className="button" onClick={()=>downloadFile(`${shoot.name.replace(/[^\w-]+/g,'-')}.ics`,toICS([event],workspace.timezone,shoot.name))}><Download size={15}/>.ics</button>
  </div>
  <article className="document call-sheet">
   <header className="cs-header">
    <div><span className="eyebrow">CALL SHEET</span><h2>{shoot.name}</h2><p>{workspace.name}{project?` · ${project.name}`:''}</p></div>
    <div className="cs-date"><b>{new Date(shoot.date+'T12:00:00Z').toLocaleDateString('en-IN',{weekday:'long',timeZone:'UTC'})}</b><strong>{displayDate(shoot.date)}</strong><span className={`badge ${shoot.status==='Confirmed'?'green':'neutral'}`}><i/>{shoot.status||'Planned'}</span></div>
   </header>
   <div className="cs-times">
    <div><span>Crew call</span><strong>{call||'TBC'}</strong></div>
    <div><span>Shoot starts</span><strong>{shoot.start_time?.slice(0,5)||'TBC'}</strong></div>
    <div><span>Estimated wrap</span><strong>{shoot.end_time?.slice(0,5)||'TBC'}</strong></div>
    <div><span>Shoot type</span><strong>{shoot.shoot_type||project?.project_type||'—'}</strong></div>
   </div>
   <div className="cs-grid">
    <section><h4>Location</h4><p className="cs-location"><MapPin size={14}/>{shoot.location||'To be confirmed'}</p>{maps&&<a className="cs-link" href={maps} target="_blank" rel="noreferrer">Open in Google Maps</a>}</section>
    <section><h4>Client</h4><p><b>{client?.name||'—'}</b></p>{client?.contact&&<p>{client.contact}</p>}{client?.phone&&<p>{client.phone}</p>}{client?.email&&<p>{client.email}</p>}</section>
   </div>
   <section><h4>Crew</h4>{crew.length?<table className="cs-table"><thead><tr><th>Name</th><th>Role</th><th>Contact</th></tr></thead><tbody>{crew.map(c=><tr key={c.name}><td>{c.name}</td><td>{c.role}</td><td>{c.email||'—'}</td></tr>)}</tbody></table>:<p className="document-notes">Add crew to the shoot or assign team members to the project.</p>}</section>
   <section><h4>Schedule</h4><table className="cs-table"><tbody>
    <tr><td className="cs-time">{call||'—'}</td><td>Crew call & setup</td></tr>
    <tr><td className="cs-time">{shoot.start_time?.slice(0,5)||'—'}</td><td>Shooting begins</td></tr>
    <tr><td className="cs-time">{shoot.end_time?.slice(0,5)||'—'}</td><td>Estimated wrap & pack down</td></tr>
   </tbody></table></section>
   <div className="cs-grid">
    <section><h4>Equipment</h4>{lines(shoot.equipment).length||rented.length?<ul className="cs-checklist">{lines(shoot.equipment).map(l=><li key={l}>{l}</li>)}{rented.map(r=><li key={r.id}>{rentalLine(r)}<span className="cs-rental-tag">Rental{r.reference?` · ${r.reference}`:''}</span></li>)}</ul>:<p className="document-notes">No equipment notes yet.</p>}</section>
    <section><h4>Shot list</h4>{lines(shoot.shot_notes).length?<ol className="cs-checklist numbered">{lines(shoot.shot_notes).map(l=><li key={l}>{l}</li>)}</ol>:<p className="document-notes">No shot list yet.</p>}</section>
   </div>
   {(shoot.notes||project?.brief)&&<section><h4>Notes</h4>{shoot.notes&&<p className="document-notes">{shoot.notes}</p>}{project?.brief&&<details className="cs-brief"><summary>Project brief</summary><p className="document-notes">{project.brief}</p></details>}</section>}
  </article>
 </>;
}
