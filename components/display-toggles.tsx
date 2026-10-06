'use client';
import {useEffect,useState} from 'react';
import {Moon,Sparkles,MousePointer2} from 'lucide-react';

/** Display preferences live on <html> (rendered from cookies by the root layout) and in cookies. */
type Pref={key:'theme'|'glass'|'cursor';cookie:string;label:string;icon:typeof Moon;isOn:(v?:string)=>boolean;value:(on:boolean)=>string};
const PREFS:Pref[]=[
 {key:'theme',cookie:'grid-theme',label:'Dark mode',icon:Moon,isOn:v=>v==='dark',value:on=>on?'dark':'light'},
 {key:'glass',cookie:'grid-glass',label:'Liquid glass',icon:Sparkles,isOn:v=>v!=='off',value:on=>on?'on':'off'},
 {key:'cursor',cookie:'grid-cursor',label:'Glass cursor',icon:MousePointer2,isOn:v=>v!=='off',value:on=>on?'on':'off'},
];
const savePref=(key:string,value:string)=>{document.cookie=`${key}=${value};path=/;max-age=31536000;samesite=lax`;};

/** Control Center–style icon toggles: Dark mode, Liquid glass, Glass cursor. */
export default function DisplayToggles({className=''}:{className?:string}){
 // server and first client render match; the real values (from <html>) are read right after mount
 const [state,setState]=useState<Record<string,boolean>>({theme:false,glass:true,cursor:true});
 useEffect(()=>{const d=document.documentElement.dataset;setState(Object.fromEntries(PREFS.map(p=>[p.key,p.isOn(d[p.key])])));},[]);
 const toggle=(p:Pref)=>{const next=!state[p.key];setState(s=>({...s,[p.key]:next}));document.documentElement.dataset[p.key]=p.value(next);savePref(p.cookie,p.value(next));};
 return <div className={`control-row ${className}`} role="group" aria-label="Display">
  {PREFS.map(p=>{const on=state[p.key];const Icon=p.icon;return <button key={p.key} type="button" className={`cc-tile ${on?'on':''}`} aria-pressed={on} aria-label={p.label} title={`${p.label} · ${on?'On':'Off'}`} onClick={()=>toggle(p)}><Icon size={17}/></button>;})}
 </div>;
}
