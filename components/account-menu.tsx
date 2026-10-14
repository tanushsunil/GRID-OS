'use client';
import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import Link from 'next/link';
import {Settings,LogOut} from 'lucide-react';
import {Avatar} from './ui';

/** Your initials in the top bar; opens your name, workspace, Settings and Sign out. */
export default function AccountMenu({name,detail,role,onSignOut}:{name:string;detail?:string;role:string;onSignOut:()=>void}){
 const [open,setOpen]=useState(false);const [pos,setPos]=useState<{top:number;right:number}|null>(null);
 const button=useRef<HTMLButtonElement>(null);const panel=useRef<HTMLDivElement>(null);
 // rendered at the top of the page (like the notifications panel) so its own glass blur can see the page behind it
 useLayoutEffect(()=>{if(!open)return;const place=()=>{const r=button.current?.getBoundingClientRect();if(r)setPos({top:r.bottom+10,right:Math.max(12,window.innerWidth-r.right-8)});};place();window.addEventListener('resize',place);window.addEventListener('scroll',place,true);return()=>{window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true);};},[open]);
 useEffect(()=>{if(!open)return;const close=(e:MouseEvent)=>{const t=e.target as Node;if(!button.current?.contains(t)&&!panel.current?.contains(t))setOpen(false);};const esc=(e:KeyboardEvent)=>{if(e.key==='Escape'){setOpen(false);button.current?.focus();}};document.addEventListener('mousedown',close);document.addEventListener('keydown',esc);return()=>{document.removeEventListener('mousedown',close);document.removeEventListener('keydown',esc);};},[open]);
 return <div className="account-menu">
  <button ref={button} type="button" className="account-button" aria-label={`Account: ${name}`} aria-expanded={open} aria-haspopup="menu" onClick={()=>setOpen(o=>!o)}><Avatar name={name} size="tiny"/></button>
  {open&&pos&&createPortal(<div ref={panel} className="notification-panel account-panel" role="menu" aria-label="Account" style={{top:pos.top,right:pos.right}}>
   <div className="account-head"><Avatar name={name}/><span><strong>{name}</strong>{detail&&<small>{detail}</small>}<small className="account-role">{role}</small></span></div>
   <Link role="menuitem" className="account-item" href="/settings" onClick={()=>setOpen(false)}><Settings size={16}/>Settings</Link>
   <button role="menuitem" type="button" className="account-item danger" onClick={()=>{setOpen(false);onSignOut();}}><LogOut size={16}/>Sign out</button>
  </div>,document.body)}
 </div>;
}
