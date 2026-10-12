'use client';
import {Fragment,useEffect,useRef,useState,type ReactNode} from 'react';
import {X,Loader2,Sparkles} from 'lucide-react';
import {requestJson} from '@/lib/http';

/** Inline markdown used in the changelog: **bold**, `code` and [links](url). Text stays text (no HTML). */
function inline(text:string):ReactNode[]{
 const out:ReactNode[]=[];const re=/\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;let last=0,m:RegExpExecArray|null,k=0;
 while((m=re.exec(text))){if(m.index>last)out.push(text.slice(last,m.index));
  if(m[1]!==undefined)out.push(<strong key={k++}>{inline(m[1])}</strong>);
  else if(m[2]!==undefined)out.push(<code key={k++}>{m[2]}</code>);
  else out.push(<a key={k++} href={m[4]} target="_blank" rel="noreferrer">{m[3]}</a>);
  last=re.lastIndex;}
 if(last<text.length)out.push(text.slice(last));
 return out;
}
type Item={text:string;children:Item[]};
type Block={kind:'h2'|'h3'|'p'|'list';text?:string;items?:Item[]};
/** Just the subset of markdown CHANGELOG.md uses: headings, paragraphs, nested bullet lists, rules. */
export function parseChangelog(md:string){
 const lines=md.replace(/\r/g,'').split('\n');const blocks:Block[]=[];let intro:string[]=[];let title='';
 for(let i=0;i<lines.length;i++){
  const line=lines[i];
  if(/^# /.test(line)){title=line.slice(2).trim();continue;}
  if(/^---\s*$/.test(line)||!line.trim())continue;
  if(/^## /.test(line)){blocks.push({kind:'h2',text:line.slice(3).trim()});continue;}
  if(/^### /.test(line)){blocks.push({kind:'h3',text:line.slice(4).trim()});continue;}
  if(/^\s*([-*]|\d+\.) /.test(line)){
   const root:Item[]=[];const stack:{indent:number;items:Item[]}[]=[{indent:-1,items:root}];
   for(;i<lines.length&&/^\s*([-*]|\d+\.) /.test(lines[i]);i++){
    const indent=lines[i].match(/^\s*/)![0].length;const item:Item={text:lines[i].replace(/^\s*([-*]|\d+\.) /,''),children:[]};
    while(stack.length>1&&indent<=stack[stack.length-1].indent)stack.pop();
    stack[stack.length-1].items.push(item);stack.push({indent,items:item.children});
   }
   i--;blocks.push({kind:'list',items:root});continue;
  }
  if(!blocks.length){intro.push(line.trim());continue;}
  blocks.push({kind:'p',text:line.trim()});
 }
 return {title,intro:intro.join(' '),blocks};
}
const List=({items}:{items:Item[]})=><ul>{items.map((it,i)=><li key={i}>{inline(it.text)}{it.children.length>0&&<List items={it.children}/>}</li>)}</ul>;

/** Settings → What's new: the changelog, newest first. */
export default function ChangelogDialog({version,onClose}:{version:string;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null);const [md,setMd]=useState<string|null>(null);const [error,setError]=useState('');
 useEffect(()=>{dialog.current?.showModal();requestJson<{markdown:string}>('/api/changelog').then(d=>setMd(d.markdown)).catch(e=>setError((e as Error).message));},[]);
 const doc=md?parseChangelog(md):null;
 // group blocks under each release heading so every release is its own card
 const sections:{head?:string;body:Block[]}[]=[];
 for(const b of doc?.blocks||[]){if(b.kind==='h2'||!sections.length)sections.push({head:b.kind==='h2'?b.text:undefined,body:[]});if(b.kind!=='h2')sections[sections.length-1].body.push(b);}
 return <dialog ref={dialog} className="modal changelog" onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target===dialog.current)onClose();}}>
  <div className="modal-head"><div><span className="eyebrow">GRID OS {version}</span><h2>What’s new</h2></div><button type="button" className="icon-button" aria-label="Close" onClick={onClose}><X size={18}/></button></div>
  <div className="modal-content changelog-body">
   {error?<p className="notice error" role="alert">{error}</p>:!doc?<p className="muted"><Loader2 size={14} className="auth-spin"/> Loading…</p>:<>
    {doc.intro&&<p className="muted changelog-intro">{inline(doc.intro)}</p>}
    {sections.map((s,i)=>{const m=(s.head||'').match(/^(.+?)\s+[—–-]\s+(.+?)\s+·\s+(.+)$/);const name=m?`${m[1]} · ${m[3]}`:(s.head||'');const rest=m?[m[2]]:[];const upcoming=/next up|planned|unreleased/i.test(s.head||'');
     return <section key={i} className={`changelog-release ${upcoming?'upcoming':''} ${i===(sections.findIndex(x=>!/next up|planned|unreleased/i.test(x.head||'')))?'latest':''}`}>
      {s.head&&<header><h3>{upcoming&&<Sparkles size={15}/>}{name}</h3>{rest.length>0&&<span>{rest.join(' · ')}</span>}</header>}
      {s.body.map((b,j)=><Fragment key={j}>{b.kind==='h3'?<h4>{inline(b.text!)}</h4>:b.kind==='list'?<List items={b.items!}/>:/^\*\*[^*]+\*\*$/.test(b.text!)?<h4>{b.text!.slice(2,-2)}</h4>:<p className={/^\*\*Database:\*\*/.test(b.text!)?'changelog-db':''}>{inline(b.text!)}</p>}</Fragment>)}
     </section>;})}
   </>}
  </div>
 </dialog>;
}
