import {createServerClient} from '@supabase/ssr';
import {NextResponse,type NextRequest} from 'next/server';
/** Keeps the sign-in session fresh (verified locally where possible, so it's fast). If the auth service is slow or down, the request still goes through. */
export async function proxy(request:NextRequest){
 let response=NextResponse.next({request});
 if(!process.env.NEXT_PUBLIC_SUPABASE_URL||!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)return response;
 try{
  const client=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{cookies:{getAll:()=>request.cookies.getAll(),setAll:values=>{values.forEach(({name,value})=>request.cookies.set(name,value));response=NextResponse.next({request});values.forEach(({name,value,options})=>response.cookies.set(name,value,options));}}});
  let timer:ReturnType<typeof setTimeout>|undefined;
  await Promise.race([client.auth.getClaims(),new Promise(resolve=>{timer=setTimeout(resolve,4000);})]).finally(()=>clearTimeout(timer));
 }catch(err){console.error('[proxy] session refresh failed',err);}
 return response;
}
// Skip static files (fonts, images, icons) — they never need a session.
export const config={matcher:['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|ttf|otf|woff2?|css|js|map)$).*)']};
