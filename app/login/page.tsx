import {redirect} from 'next/navigation';
import type {Metadata} from 'next';
import {configured,supabase} from '@/lib/supabase';
import LoginForm,{type AuthMode} from '@/components/login-form';

export const metadata:Metadata={title:'Sign in · GRID OS'};

export default async function Login({searchParams}:{searchParams:Promise<{[key:string]:string|string[]|undefined}>}){
 const params=await searchParams;const mode:AuthMode=params.mode==='update'?'update':params.mode==='signup'?'signup':'login';
 const demo=process.env.GRID_DEMO_MODE==='true';const ready=configured();
 // already signed in → straight to the workspace (except when finishing a password reset)
 if(ready&&mode!=='update'){const db=await supabase();const {data:{user}}=await db.auth.getUser();if(user)redirect('/');}
 return <LoginForm initialMode={mode} demo={demo} ready={ready} linkError={params.error==='link'||params.error==='confirmation'}/>;
}
