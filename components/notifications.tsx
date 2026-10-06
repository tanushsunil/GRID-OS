'use client';
import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import Link from 'next/link';
import {Bell,CheckCheck,AlertTriangle,Clock,Clapperboard,Wallet,UserPlus,Users,Camera} from 'lucide-react';
import type {Notification} from '@/lib/extras';

const icons:Record<string,any>={Tasks:Clock,Deliverables:Clock,Shoots:Clapperboard,Payments:Wallet,Leads:UserPlus,Team:Users,Rentals:Camera};

export default function Notifications({items,read,onRead,onReadAll}:{items:Notification[];read:string[];onRead:(id:string)=>void;onReadAll:()=>void}){
 const [open,setOpen]=useState(false);const [pos,setPos]=useState<{top:number;right:number}|null>(null);
 const button=useRef<HTMLButtonElement>(null);const panel=useRef<HTMLDivElement>(null);
 const unread=items.filter(n=>!read.includes(n.id));
 // The panel is rendered at the top of the page (outside the frosted top bar) so its own backdrop blur
 // can see the page behind it — a blurred element nested inside another blurred element cannot.
 useLayoutEffect(()=>{if(!open)return;const place=()=>{const r=button.current?.getBoundingClientRect();if(r)setPos({top:r.bottom+10,right:Math.max(12,window.innerWidth-r.right-8)});};place();window.addEventListener('resize',place);window.addEventListener('scroll',place,true);return()=>{window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true);};},[open]);
 useEffect(()=>{if(!open)return;const close=(e:MouseEvent)=>{const t=e.target as Node;if(!button.current?.contains(t)&&!panel.current?.contains(t))setOpen(false);};const esc=(e:KeyboardEvent)=>{if(e.key==='Escape'){setOpen(false);button.current?.focus();}};document.addEventListener('mousedown',close);document.addEventListener('keydown',esc);return()=>{document.removeEventListener('mousedown',close);document.removeEventListener('keydown',esc);};},[open]);
 return <div className="notifications">
  <button ref={button} className="icon-button bell" aria-label={`Notifications${unread.length?`, ${unread.length} unread`:''}`} aria-expanded={open} aria-haspopup="dialog" onClick={()=>setOpen(o=>!o)}><Bell size={17}/>{unread.length>0&&<span className="bell-count">{unread.length>9?'9+':unread.length}</span>}</button>
  {open&&pos&&createPortal(<div ref={panel} className="notification-panel" role="dialog" aria-label="Notifications" style={{top:pos.top,right:pos.right}}>
   <div className="notification-head"><strong>Notifications</strong>{unread.length>0&&<button className="link-button" onClick={onReadAll}><CheckCheck size={14}/>Mark all as read</button>}</div>
   <div className="notification-list">
    {!items.length&&<p className="notification-empty">You’re all caught up.</p>}
    {items.map(n=>{const Icon=n.tone==='critical'?AlertTriangle:icons[n.kind]||Bell;const isRead=read.includes(n.id);return <Link key={n.id} href={n.href} className={`notification-item ${n.tone} ${isRead?'read':''}`} onClick={()=>{onRead(n.id);setOpen(false);}}>
     <span className="notification-icon"><Icon size={15}/></span>
     <span className="notification-text"><strong>{n.title}</strong><small>{n.kind} · {n.text}</small></span>
     {!isRead&&<i className="unread-dot" aria-label="Unread"/>}
    </Link>;})}
   </div>
   <Link href="/activity" className="notification-foot" onClick={()=>setOpen(false)}>View all activity</Link>
  </div>,document.body)}
 </div>;
}
