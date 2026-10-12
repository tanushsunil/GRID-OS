'use client';
import {useEffect,useSyncExternalStore} from 'react';
import {Download,Check,Share} from 'lucide-react';

/** Chrome/Edge's install prompt. It fires once, early, so it's kept here until someone presses Install. */
type InstallPrompt=Event&{prompt:()=>Promise<void>;userChoice:Promise<{outcome:'accepted'|'dismissed'}>};
let deferred:InstallPrompt|null=null;let installed=false;
const listeners=new Set<()=>void>();
const emit=()=>listeners.forEach(l=>l());
const subscribe=(l:()=>void)=>{listeners.add(l);return ()=>{listeners.delete(l);};};
const standalone=()=>typeof window!=='undefined'&&(window.matchMedia('(display-mode: standalone)').matches||(navigator as Navigator&{standalone?:boolean}).standalone===true);
type InstallState='installed'|'ready'|'safari-mac'|'ios'|'unsupported';
function current():InstallState{
 if(installed||standalone())return 'installed';
 if(deferred)return 'ready';
 const ua=navigator.userAgent;
 if(/iPhone|iPad|iPod/.test(ua)||(/Macintosh/.test(ua)&&navigator.maxTouchPoints>1))return 'ios';
 if(/Safari/.test(ua)&&!/Chrome|Chromium|Edg|OPR|Firefox/.test(ua))return 'safari-mac';
 return 'unsupported';
}
let snapshot:InstallState='unsupported';
const getSnapshot=()=>snapshot;
const refresh=()=>{const next=current();if(next!==snapshot){snapshot=next;emit();}};

/** Mounted once in the root layout: registers the service worker and listens for the install prompt. */
export function PwaSetup(){
 useEffect(()=>{
  refresh();
  const onPrompt=(e:Event)=>{e.preventDefault();deferred=e as InstallPrompt;refresh();};
  const onInstalled=()=>{installed=true;deferred=null;refresh();};
  window.addEventListener('beforeinstallprompt',onPrompt);window.addEventListener('appinstalled',onInstalled);
  if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js',{scope:'/'}).catch(err=>console.warn('[pwa] service worker not registered',err));
  return ()=>{window.removeEventListener('beforeinstallprompt',onPrompt);window.removeEventListener('appinstalled',onInstalled);};
 },[]);
 return null;
}

/** Settings → Install GRID OS: one button where the browser supports it, otherwise the steps for Safari. */
export default function InstallApp(){
 const state=useSyncExternalStore(subscribe,getSnapshot,()=>'unsupported' as InstallState);
 useEffect(refresh,[]);
 async function install(){
  if(!deferred)return;const prompt=deferred;deferred=null;
  await prompt.prompt();const {outcome}=await prompt.userChoice;
  if(outcome==='accepted')installed=true;refresh();
 }
 return <div className="settings-form about-row">
  <span><strong>{state==='installed'?'GRID OS is installed':'Use GRID OS as an app'}</strong><small>{
   state==='installed'?'It opens in its own window from your Dock, taskbar or home screen.'
   :state==='ready'?'Its own window and icon in your Dock or taskbar, like YouTube Music.'
   :state==='safari-mac'?'In Safari, choose File → Add to Dock.'
   :state==='ios'?<>Tap <Share size={12} style={{verticalAlign:'-1px'}}/> Share, then Add to Home Screen.</>
   :'Open GRID OS in Chrome, Edge or Safari to install it as an app.'}</small></span>
  {state==='installed'?<span className="muted"><Check size={15} style={{verticalAlign:'-2px'}}/> Installed</span>
   :state==='ready'&&<button type="button" className="button primary" onClick={install}><Download size={15}/>Install app</button>}
 </div>;
}
