'use client';
import Link from 'next/link';
import {Mail,Check,BellRing} from 'lucide-react';
import {money,displayDate} from '@/lib/domain';
import type {DueReminder,ReminderSettings,ReminderLog} from '@/lib/extras';

export function ReminderQueue({reminders,onSend,onMarkSent,compact=false}:{reminders:DueReminder[];onSend:(r:DueReminder)=>void;onMarkSent:(r:DueReminder)=>void;compact?:boolean}){
 if(!reminders.length)return <p className="prose muted reminder-empty"><BellRing size={16}/>No reminders due. GRID OS checks every open invoice and lines up the next reminder automatically.</p>;
 return <div className="reminder-list">{reminders.map(r=><div className={`reminder-row ${r.tone}`} key={r.key}>
  <span className="reminder-status">{r.label}</span>
  <div className="reminder-main">{compact?<strong>{r.invoice.number}</strong>:<Link href={'/invoices/'+r.invoice.id}><strong>{r.invoice.number}</strong> · {r.invoice.name}</Link>}<small>{money(r.balance)} outstanding · due {displayDate(r.invoice.due_date)}{r.email?` · to ${r.contact||r.email}`:' · no client email on file'}</small></div>
  <div className="reminder-actions">
   <a className={`button small ${r.email?'primary':''}`} href={r.mailto} onClick={()=>onSend(r)} aria-disabled={!r.email}><Mail size={14}/>Send reminder</a>
   <button className="button small" onClick={()=>onMarkSent(r)} title="Mark as handled without opening an email"><Check size={14}/>Mark sent</button>
  </div>
 </div>)}</div>;
}

export function ReminderHistory({log,numberOf}:{log:ReminderLog[];numberOf:(id:string)=>string}){
 if(!log.length)return null;
 return <div className="reminder-history"><h4>Recently sent</h4>{log.slice(0,5).map(l=><div key={l.id}><span>{numberOf(l.invoice_id)} · {l.stage==='before'?'Before due date':l.stage==='due'?'Due date':'Overdue follow-up'}</span><small>{new Date(l.sent_at).toLocaleDateString('en-IN',{day:'numeric',month:'short'})}</small></div>)}</div>;
}

export function ReminderSettingsForm({settings,onChange,disabled}:{settings:ReminderSettings;onChange:(s:ReminderSettings)=>void;disabled?:boolean}){
 return <div className="settings-form reminder-settings">
  <label className="toggle-row"><span><strong>Automatic payment reminders</strong><small>Line up reminders for every open invoice and flag them in notifications.</small></span><input type="checkbox" role="switch" checked={settings.enabled} disabled={disabled} onChange={e=>onChange({...settings,enabled:e.target.checked})}/></label>
  <div className="form-grid">
   <label>Friendly reminder<select value={settings.before} disabled={disabled||!settings.enabled} onChange={e=>onChange({...settings,before:Number(e.target.value)})}>{[1,3,5,7].map(n=><option key={n} value={n}>{n} day{n===1?'':'s'} before due</option>)}</select></label>
   <label>Overdue follow-ups<select value={settings.every} disabled={disabled||!settings.enabled} onChange={e=>onChange({...settings,every:Number(e.target.value)})}>{[3,7,14].map(n=><option key={n} value={n}>Every {n} days overdue</option>)}</select></label>
  </div>
  <label className="toggle-row"><span><strong>Remind on the due date</strong><small>Send a short note on the day payment is due.</small></span><input type="checkbox" role="switch" checked={settings.onDue} disabled={disabled||!settings.enabled} onChange={e=>onChange({...settings,onDue:e.target.checked})}/></label>
  <p className="muted small-note">Reminders open as a ready-to-send email in your mail app. Fully hands-off sending needs an email service connected to a live workspace.</p>
 </div>;
}
