'use client';
import {useEffect,useRef,useState} from 'react';
import {ArrowRight,Mail,Lock,Eye,EyeOff,Clapperboard,Wallet,BarChart3,ArrowLeft,AlertTriangle,CheckCircle2,Info,Loader2,KeyRound} from 'lucide-react';
import {GridLogo,LOGO} from './logo';
import DisplayToggles from './display-toggles';
import {requestJson} from '@/lib/http';
import {normaliseGridCode,GRID_CODE_EXAMPLE} from '@/lib/grid-code';

export type AuthMode='login'|'signup'|'reset'|'update'|'code';
type Notice={tone:'error'|'success'|'info';text:string}|null;
type Field='email'|'password'|'confirm'|'code';

const SECTIONS=[
 {key:'production',label:'Production',text:'Projects, shoots, crew and rental gear',icon:Clapperboard},
 {key:'finance',label:'Finance',text:'Estimates, invoices, payments and expenses',icon:Wallet},
 {key:'data',label:'Data',text:'Live reports and every dataset to explore',icon:BarChart3},
] as const;
const COPY:Record<AuthMode,{title:string;text:string;cta:string}>={
 login:{title:'Welcome back',text:'Sign in to pick up where you left off.',cta:'Sign in'},
 signup:{title:'Create your account',text:'Bring your studio’s work into one place.',cta:'Create account'},
 reset:{title:'Reset your password',text:'Enter the email on your account and we’ll send you a secure reset link.',cta:'Send reset link'},
 update:{title:'Choose a new password',text:'Set a new password for your GRID OS account.',cta:'Update password'},
 code:{title:'Sign in with GRID',text:'Enter your six-digit GRID number. You’ll find it in Settings, under Sign in with GRID.',cta:'Sign in'},
};
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** 0–4 password strength from length and character variety. */
export function passwordStrength(p:string){
 if(!p)return {score:0,label:''};
 let score=0;if(p.length>=8)score++;if(p.length>=12)score++;if(/[a-z]/.test(p)&&/[A-Z]/.test(p))score++;if(/\d/.test(p)&&/[^A-Za-z0-9]/.test(p))score++;
 if(p.length<8)score=Math.min(score,1);
 return {score,label:['Too short','Weak','Fair','Good','Strong'][score]};
}

export default function LoginForm({initialMode,demo,ready,linkError}:{initialMode:AuthMode;demo:boolean;ready:boolean;linkError:boolean}){
 const [mode,setMode]=useState<AuthMode>(initialMode);
 const [email,setEmail]=useState('');const [code,setCode]=useState('');const [password,setPassword]=useState('');const [confirm,setConfirm]=useState('');
 const [show,setShow]=useState(false);const [caps,setCaps]=useState(false);const [busy,setBusy]=useState(false);
 const [errors,setErrors]=useState<Record<string,string>>({});
 const [notice,setNotice]=useState<Notice>(linkError?{tone:'error',text:'That link has expired or was already used. Request a new one below.'}:null);
 const refs={code:useRef<HTMLInputElement>(null),email:useRef<HTMLInputElement>(null),password:useRef<HTMLInputElement>(null),confirm:useRef<HTMLInputElement>(null)};
 const copy=COPY[mode];const strength=passwordStrength(password);const needsPassword=mode!=='reset'&&mode!=='code';const needsEmail=mode!=='update'&&mode!=='code';
 const firstField:Field=mode==='code'?'code':needsEmail?'email':'password';
 const enabled=ready&&!demo;

 useEffect(()=>{if(enabled)refs[firstField].current?.focus();},[mode,enabled]);
 const switchTo=(next:AuthMode)=>{setMode(next);setErrors({});setNotice(null);setPassword('');setConfirm('');setShow(false);};
 const capsCheck=(e:React.KeyboardEvent)=>setCaps(e.getModifierState?.('CapsLock')??false);

 const validate=()=>{
  const e:Record<string,string>={};
  if(mode==='code'&&!normaliseGridCode(code))e.code='Enter the six digits of your GRID number.';
  if(needsEmail&&!EMAIL.test(email.trim()))e.email='Enter a valid email address.';
  if(needsPassword&&password.length<8)e.password='Use at least 8 characters.';
  if((mode==='signup'||mode==='update')&&password.length>=8&&strength.score<2)e.password='Make it stronger — add length, capitals, numbers or a symbol.';
  if((mode==='signup'||mode==='update')&&confirm!==password)e.confirm='Passwords don’t match.';
  setErrors(e);
  const first=(['code','email','password','confirm'] as Field[]).find(k=>e[k]);if(first)refs[first].current?.focus();
  return !Object.keys(e).length;
 };

 const submit=async(ev:React.FormEvent)=>{
  ev.preventDefault();if(!enabled||busy||!validate())return;
  setBusy(true);setNotice(null);
  try{
   const data:any=await requestJson('/api/auth',{body:mode==='code'?{action:'code',code}:{action:mode,identifier:email.trim(),email:email.trim(),password}});
   if(mode==='login'||mode==='code'){window.location.href='/';return;}
   if(mode==='signup'){if(data.confirmation){setNotice({tone:'success',text:`Check ${email.trim()} for a confirmation link, then sign in.`});switchToKeepNotice('login');}else if(data.signedIn===false){setNotice({tone:'success',text:'Account created. Sign in with your email and password.'});switchToKeepNotice('login');}else window.location.href='/';return;}
   if(mode==='reset'){setNotice({tone:'success',text:`If an account exists for ${email.trim()}, a reset link is on its way. It expires in an hour.`});return;}
   if(mode==='update'){setNotice({tone:'success',text:'Password updated. Taking you to your workspace…'});setTimeout(()=>{window.location.href='/';},1200);return;}
  }catch(err){setNotice({tone:'error',text:(err as Error).message});}
  finally{setBusy(false);}
 };
 const switchToKeepNotice=(next:AuthMode)=>{setMode(next);setErrors({});setPassword('');setConfirm('');};

 const field=(name:Field,props:{label:string;icon:typeof Mail;value:string;set:(v:string)=>void;type:string;autoComplete:string;placeholder?:string;inputMode?:'numeric'|'text'|'email';hint?:string;plain?:boolean;trailing?:React.ReactNode})=>{
  const Icon=props.icon;const err=errors[name];const described=err?`${name}-error`:props.hint?`${name}-hint`:undefined;
  return <label className={`auth-field ${err?'invalid':''}`}>
   <span className="auth-label">{props.label}</span>
   <span className="auth-input"><Icon size={16} aria-hidden="true"/>
    <input ref={refs[name]} name={name} type={props.type} value={props.value} placeholder={props.placeholder} inputMode={props.inputMode} autoComplete={props.autoComplete} disabled={!enabled||busy} aria-invalid={!!err} aria-describedby={described}
     {...(props.plain?{autoCapitalize:'none',autoCorrect:'off',spellCheck:false}:{})}
     onChange={e=>{props.set(e.target.value);if(errors[name])setErrors(x=>{const n={...x};delete n[name];return n;});}} onKeyUp={capsCheck} onKeyDown={capsCheck}/>
    {props.trailing}
   </span>
   {err?<span className="auth-error" id={`${name}-error`}>{err}</span>:props.hint&&<span className="auth-hint" id={`${name}-hint`}>{props.hint}</span>}
  </label>;
 };

 const NoticeIcon=notice?.tone==='error'?AlertTriangle:notice?.tone==='success'?CheckCircle2:Info;
 return <div className="auth-shell">
  <div className="auth-toggles"><DisplayToggles/></div>

  <aside className="auth-brand">
   <svg className="auth-watermark" viewBox={LOGO.viewBox.join(' ')} aria-hidden="true"><path d={LOGO.letters.d} fillRule="evenodd"/>{LOGO.stripes.map(s=><path key={s.d} d={s.d}/>)}</svg>
   <div className="auth-brand-top"><GridLogo size={52}/></div>
   <div className="auth-brand-body">
    <h1>Your work,<br/>from first brief<br/>to final delivery.</h1>
    <p>GRID OS brings production, finance and data together in one connected workspace.</p>
    <ul className="auth-sections">{SECTIONS.map(s=>{const Icon=s.icon;return <li key={s.key} className={`auth-section ${s.key}`}><span className="auth-section-icon"><Icon size={18}/></span><span><strong>{s.label}</strong><small>{s.text}</small></span></li>;})}</ul>
   </div>
   <small className="auth-brand-foot">GRID media · Agency workspace</small>
  </aside>

  <main className="auth-main">
   <div className="auth-card">
    <div className="auth-card-logo"><GridLogo size={40}/></div>
    {demo?<>
     <span className="eyebrow">DEMO WORKSPACE</span>
     <h2>Explore GRID OS</h2>
     <p className="auth-sub">This copy runs in demo mode: everything is stored in this browser and nothing is shared. No account is needed.</p>
     <a className="button primary auth-submit" href="/">Open demo workspace<ArrowRight size={16}/></a>
     <p className="auth-fine"><KeyRound size={13}/>Team sign-in turns on once the workspace is connected to its database.</p>
    </>:<>
     {(mode==='login'||mode==='signup')&&<div className="segmented auth-tabs" role="tablist" aria-label="Account">
      <button type="button" role="tab" aria-selected={mode==='login'} className={mode==='login'?'active':''} onClick={()=>switchTo('login')}>Sign in</button>
      <button type="button" role="tab" aria-selected={mode==='signup'} className={mode==='signup'?'active':''} onClick={()=>switchTo('signup')}>Create account</button>
     </div>}
     {(mode==='reset'||mode==='code')&&<button type="button" className="link-button auth-back" onClick={()=>switchTo('login')}><ArrowLeft size={14}/>Back to sign in</button>}
     <h2>{copy.title}</h2>
     <p className="auth-sub">{copy.text}</p>
     {!ready&&<p className="auth-notice info" role="status"><Info size={16}/>Sign-in isn’t set up on this server yet. Ask your administrator to connect the database.</p>}
     {notice&&<p className={`auth-notice ${notice.tone}`} role={notice.tone==='error'?'alert':'status'}><NoticeIcon size={16}/>{notice.text}</p>}
     <form className="auth-form" onSubmit={submit} noValidate>
      {mode==='code'&&field('code',{label:'Your GRID number',icon:KeyRound,value:code,set:v=>setCode(v.replace(/[^\d ]/g,'').slice(0,7)),type:'text',inputMode:'numeric',autoComplete:'one-time-code',placeholder:GRID_CODE_EXAMPLE,plain:true})}
      {needsEmail&&field('email',{label:'Email',icon:Mail,value:email,set:setEmail,type:'email',autoComplete:'email',placeholder:'you@studio.com',plain:true})}
      {needsPassword&&field('password',{label:mode==='update'?'New password':'Password',icon:Lock,value:password,set:setPassword,type:show?'text':'password',autoComplete:mode==='login'?'current-password':'new-password',
       trailing:<button type="button" className="auth-eye" onClick={()=>setShow(s=>!s)} aria-label={show?'Hide password':'Show password'} aria-pressed={show} disabled={!enabled}>{show?<EyeOff size={16}/>:<Eye size={16}/>}</button>})}
      {needsPassword&&caps&&<p className="auth-caps"><AlertTriangle size={13}/>Caps Lock is on</p>}
      {(mode==='signup'||mode==='update')&&password&&<div className={`auth-strength s${strength.score}`} aria-live="polite"><span className="auth-meter">{[1,2,3,4].map(i=><i key={i} className={i<=strength.score?'on':''}/>)}</span><small>{strength.label}</small></div>}
      {(mode==='signup'||mode==='update')&&field('confirm',{label:'Confirm password',icon:Lock,value:confirm,set:setConfirm,type:show?'text':'password',autoComplete:'new-password'})}
      {mode==='login'&&<button type="button" className="link-button auth-forgot" onClick={()=>switchTo('reset')} disabled={!enabled}>Forgot password?</button>}
      <button className="button primary auth-submit" disabled={!enabled||busy}>{busy?<><Loader2 size={16} className="auth-spin"/>Please wait…</>:<>{copy.cta}<ArrowRight size={16}/></>}</button>
     </form>
     {mode==='login'&&<><div className="auth-or" aria-hidden="true"><span>or</span></div>
      <button type="button" className="button auth-grid" onClick={()=>switchTo('code')} disabled={!enabled}><GridLogo size={20}/>Sign in with GRID</button></>}
     {mode==='signup'&&<p className="auth-fine">By creating an account you join your studio’s private workspace. Your administrator controls access.</p>}
    </>}
   </div>
  </main>
 </div>;
}
