'use client';
import {useEffect} from 'react';
export default function ErrorPage({error,retry}:{error:Error&{digest?:string};retry:()=>void}){
 useEffect(()=>{console.error('[grid] page error',error);},[error]);
 return <main className="center-state"><h1>Something interrupted your workspace.</h1><p>Your saved work is safe. Try loading this page again.</p><div className="center-actions"><button className="button primary" onClick={()=>retry()}>Try again</button><a className="button" href="/">Go to home</a></div>{error.digest&&<small className="muted">Reference: {error.digest}</small>}</main>;
}
