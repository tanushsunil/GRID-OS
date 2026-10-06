import {createServerClient} from '@supabase/ssr';
import {createClient} from '@supabase/supabase-js';
import {cookies} from 'next/headers';
export const configured=()=>!!(process.env.NEXT_PUBLIC_SUPABASE_URL&&process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
export async function supabase(){
 const jar=await cookies();
 return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,{cookies:{getAll:()=>jar.getAll(),setAll:values=>{try{values.forEach(({name,value,options})=>jar.set(name,value,options));}catch{}}}});
}
/** Server-only client with the secret key, used solely to resolve login IDs. Null when no secret key is configured. */
export function serviceClient(){
 const key=process.env.SUPABASE_SECRET_KEY;
 if(!configured()||!key)return null;
 return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
/** Who is signed in. Verifies the session token locally when the project uses signing keys (no network
 *  round trip), falling back to asking Supabase otherwise. Null when nobody is signed in. */
export async function currentUser(db:Awaited<ReturnType<typeof supabase>>){
 const {data,error}=await db.auth.getClaims();
 const claims=data?.claims;
 if(error||!claims?.sub)return null;
 return {id:claims.sub as string,email:(claims.email as string|undefined)??null};
}
