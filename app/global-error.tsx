'use client';
import {useEffect} from 'react';
// Last line of defence: replaces the root layout, so it carries its own <html>, <body> and styles.
export default function GlobalError({error,retry}:{error:Error&{digest?:string};retry:()=>void}){
 useEffect(()=>{console.error('[grid] app error',error);},[error]);
 return <html lang="en"><body style={{margin:0,minHeight:'100vh',display:'grid',placeItems:'center',fontFamily:'-apple-system,BlinkMacSystemFont,"SF Pro Display",system-ui,sans-serif',background:'#0a0a0a',color:'#f5f5f5'}}>
  <main style={{textAlign:'center',padding:24,maxWidth:420}}>
   <h1 style={{fontSize:24,margin:'0 0 8px'}}>GRID OS hit a problem.</h1>
   <p style={{color:'#a3a3a3',margin:'0 0 20px'}}>Your saved work is safe. Reload to continue.</p>
   <button onClick={()=>retry()} style={{background:'#e2560d',color:'#fff',border:0,borderRadius:12,padding:'10px 18px',fontSize:15,cursor:'pointer'}}>Try again</button>
   {error.digest&&<p style={{color:'#737373',fontSize:12,marginTop:16}}>Reference: {error.digest}</p>}
  </main>
 </body></html>;
}
