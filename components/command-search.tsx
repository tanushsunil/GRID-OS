'use client';
import {useEffect,useMemo,useRef,useState,type ComponentType} from 'react';
import {useRouter} from 'next/navigation';
import {Search,CornerDownLeft} from 'lucide-react';

export type SearchItem={id:string;group:string;title:string;meta?:string;href:string;text:string;icon:ComponentType<{size?:number}>};

const score=(item:SearchItem,terms:string[])=>{
 const title=item.title.toLowerCase();let total=0;
 for(const t of terms){
  if(title.startsWith(t))total+=30;
  else if(title.split(/\s+/).some(w=>w.startsWith(t)))total+=20;
  else if(title.includes(t))total+=12;
  else if(item.text.includes(t))total+=4;
  else return 0;
 }
 return total;
};

function Highlight({text,terms}:{text:string;terms:string[]}){
 if(!terms.length)return <>{text}</>;
 const pattern=new RegExp(`(${terms.map(t=>t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|')})`,'ig');
 return <>{text.split(pattern).map((part,i)=>i%2?<mark key={i}>{part}</mark>:part)}</>;
}

export default function CommandSearch({open,onClose,items}:{open:boolean;onClose:()=>void;items:SearchItem[]}){
 const router=useRouter();const [query,setQuery]=useState('');const [active,setActive]=useState(0);
 const input=useRef<HTMLInputElement>(null);const list=useRef<HTMLDivElement>(null);
 const terms=useMemo(()=>query.toLowerCase().trim().split(/\s+/).filter(Boolean),[query]);
 const results=useMemo(()=>{
  if(!terms.length)return items.filter(i=>i.group==='Pages');
  return items.map(i=>({i,s:score(i,terms)})).filter(x=>x.s>0).sort((a,b)=>b.s-a.s).slice(0,40).map(x=>x.i);
 },[items,terms]);
 const groups=useMemo(()=>{const map=new Map<string,SearchItem[]>();results.forEach(r=>map.set(r.group,[...(map.get(r.group)||[]),r]));return [...map.entries()];},[results]);
 const ordered=groups.flatMap(([,g])=>g);

 useEffect(()=>{if(open){setQuery('');setActive(0);requestAnimationFrame(()=>input.current?.focus());}},[open]);
 useEffect(()=>setActive(0),[query]);
 useEffect(()=>{list.current?.querySelector('[aria-selected=true]')?.scrollIntoView({block:'nearest'});},[active]);

 if(!open)return null;
 const go=(item?:SearchItem)=>{if(!item)return;onClose();router.push(item.href);};
 const onKey=(e:React.KeyboardEvent)=>{
  if(e.key==='ArrowDown'){e.preventDefault();setActive(a=>Math.min(a+1,ordered.length-1));}
  else if(e.key==='ArrowUp'){e.preventDefault();setActive(a=>Math.max(a-1,0));}
  else if(e.key==='Enter'){e.preventDefault();go(ordered[active]);}
  else if(e.key==='Escape'){e.preventDefault();onClose();}
 };
 let index=-1;
 return <div className="command-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
  <div className="command-panel" role="dialog" aria-modal="true" aria-label="Search GRID OS" onKeyDown={onKey}>
   <div className="command-input"><Search size={18}/><input ref={input} role="combobox" aria-expanded="true" aria-controls="command-results" aria-activedescendant={ordered[active]?`command-${ordered[active].id}`:undefined} placeholder="Search projects, clients, invoices, tasks…" value={query} onChange={e=>setQuery(e.target.value)}/><kbd>esc</kbd></div>
   <div className="command-results" id="command-results" role="listbox" ref={list}>
    {!ordered.length&&<p className="command-empty">No results for “{query}”</p>}
    {groups.map(([group,entries])=><div className="command-group" role="group" aria-label={group} key={group}>
     <span className="command-group-label">{group}</span>
     {entries.map(item=>{index++;const i=index;const Icon=item.icon;return <div key={item.id} id={`command-${item.id}`} role="option" aria-selected={i===active} className="command-item" onMouseMove={()=>setActive(i)} onClick={()=>go(item)}>
      <span className="command-icon"><Icon size={16}/></span>
      <span className="command-text"><strong><Highlight text={item.title} terms={terms}/></strong>{item.meta&&<small><Highlight text={item.meta} terms={terms}/></small>}</span>
      {i===active&&<CornerDownLeft size={14} className="command-enter"/>}
     </div>;})}
    </div>)}
   </div>
   <div className="command-footer"><span><kbd>↑</kbd><kbd>↓</kbd> to navigate</span><span><kbd>↵</kbd> to open</span><span><kbd>esc</kbd> to close</span></div>
  </div>
 </div>;
}
