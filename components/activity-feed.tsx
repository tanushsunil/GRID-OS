'use client';
import {useState} from 'react';
import Link from 'next/link';
import {describeActivity,activityHref,activityGroup,relativeTime,type Activity} from '@/lib/extras';
import {Avatar} from './ui';

const groups=['All','Projects','Production','Shoots','Finance','Relationships'];
const dayLabel=(iso:string,tz:string)=>{const d=new Date(iso);const key=(x:Date)=>x.toLocaleDateString('en-CA',{timeZone:tz});const today=new Date();const yesterday=new Date(Date.now()-86400000);return key(d)===key(today)?'Today':key(d)===key(yesterday)?'Yesterday':d.toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long',timeZone:tz});};

export default function ActivityFeed({activity,nameOf,timezone,filters=true,limit}:{activity:Activity[];nameOf:(id?:string)=>string;timezone:string;filters?:boolean;limit?:number}){
 const [group,setGroup]=useState('All');
 const shown=activity.filter(a=>group==='All'||activityGroup(a)===group).slice(0,limit);
 const days=new Map<string,Activity[]>();shown.forEach(a=>{const k=dayLabel(a.created_at,timezone);days.set(k,[...(days.get(k)||[]),a]);});
 return <div className="activity-feed">
  {filters&&<div className="segmented" role="tablist" aria-label="Filter activity">{groups.map(g=><button key={g} role="tab" aria-selected={group===g} className={group===g?'active':''} onClick={()=>setGroup(g)}>{g}</button>)}</div>}
  {!shown.length&&<p className="prose muted">Changes to projects, production and finance will appear here as your team works.</p>}
  {[...days.entries()].map(([day,items])=><div className="activity-day" key={day}>
   <span className="activity-day-label">{day}</span>
   {items.map(a=>{const actor=a.actor_id?nameOf(a.actor_id):'A team member';const href=activityHref(a);const text=describeActivity(a,actor);const time=<small title={new Date(a.created_at).toLocaleString('en-IN',{timeZone:timezone})}>{relativeTime(a.created_at)}</small>;
    return <div className="activity-item" key={a.id}><Avatar name={actor} size="tiny"/><span className="activity-text">{href?<Link href={href}>{text}</Link>:text}</span><span className={`activity-tag ${activityGroup(a).toLowerCase()}`}>{activityGroup(a)}</span>{time}</div>;})}
  </div>)}
 </div>;
}
