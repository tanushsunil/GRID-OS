'use client';
import {useEffect,useState} from 'react';
import {Check} from 'lucide-react';
import {ACCENTS,ACCENT_SECTIONS,accentCookie,validAccent,type AccentSection} from '@/lib/accents';

const NAMES:Record<AccentSection,string>={production:'Production',finance:'Finance',data:'Data'};

/** Settings → Section colours: pick each section's accent. Saved in this browser and applied instantly. */
export default function AccentSettings(){
 const [chosen,setChosen]=useState<Record<AccentSection,string>>(()=>Object.fromEntries(ACCENT_SECTIONS.map(s=>[s,ACCENTS[s][0].id])) as Record<AccentSection,string>);
 const [dark,setDark]=useState(true);
 useEffect(()=>{const el=document.documentElement;
  const read=()=>{setChosen(Object.fromEntries(ACCENT_SECTIONS.map(s=>[s,validAccent(s,el.getAttribute(`data-accent-${s}`))])) as Record<AccentSection,string>);setDark(el.dataset.theme!=='light');};
  read();const watch=new MutationObserver(read);watch.observe(el,{attributes:true,attributeFilter:['data-theme']});return ()=>watch.disconnect();},[]);
 const pick=(s:AccentSection,id:string)=>{setChosen(c=>({...c,[s]:id}));document.documentElement.setAttribute(`data-accent-${s}`,id);document.cookie=`${accentCookie(s)}=${id};path=/;max-age=31536000;samesite=lax`;};
 return <div className="settings-form accent-settings">
  <p className="muted">Each section keeps its own colour for buttons, highlights and the background glow. Saved for this browser.</p>
  {ACCENT_SECTIONS.map(s=><div key={s} className="accent-row" role="radiogroup" aria-label={`${NAMES[s]} colour`}>
   <strong>{NAMES[s]}</strong>
   <div className="accent-options">{ACCENTS[s].map((o,i)=>{const on=chosen[s]===o.id;return <button key={o.id} type="button" role="radio" aria-checked={on} className={`accent-option ${on?'on':''}`} style={{['--swatch' as string]:dark?o.dark:o.light}} onClick={()=>pick(s,o.id)}>
    <span className="accent-swatch">{on&&<Check size={12} strokeWidth={3}/>}</span>{o.label}{i===0&&<small>Original</small>}</button>;})}</div>
  </div>)}
 </div>;
}
