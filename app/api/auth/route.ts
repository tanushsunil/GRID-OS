import {configured,supabase,serviceClient} from '@/lib/supabase';
import {LOGIN_ID,isEmailLike,normaliseLoginId} from '@/lib/login-id';
import {reply,readJson,rateLimit,clientIp,tooMany,failure} from '@/lib/api';
import {z} from 'zod';
const email=z.email().max(254);
const password=z.string().min(8).max(128);
const loginId=z.string().transform(normaliseLoginId).pipe(z.string().regex(LOGIN_ID));
const SIGN_IN_FAILED='Unable to sign in. Check your login ID and password.';
// Brute-force guards: per address, and per account being tried (so rotating addresses doesn't help).
const LIMITS={login:[10,60_000],signup:[5,600_000],reset:[5,600_000],update:[10,600_000]} as const;

/** Turns a login ID or email into the account email. Null when it can't be resolved — callers answer generically. */
async function resolveEmail(identifier:string){
 const value=identifier.trim();
 if(isEmailLike(value))return email.safeParse(value).data??null;
 const id=loginId.safeParse(value);const service=serviceClient();
 if(!id.success||!service)return null;
 const {data,error}=await service.rpc('login_email',{login_id:id.data});
 return error||typeof data!=='string'?null:data;
}

export async function POST(request:Request){
 if(!configured())return reply({error:'Connect Supabase to enable sign-in.'},503);
 try{
  const body=await readJson(request,8*1024);const action=body.action as keyof typeof LIMITS|'logout';
  if(action in LIMITS){
   const [limit,windowMs]=LIMITS[action as keyof typeof LIMITS];
   const who=String(body.identifier||body.email||'').trim().toLowerCase().slice(0,254);
   for(const key of [`${action}:ip:${clientIp(request)}`,...(who?[`${action}:id:${who}`]:[])]){const r=rateLimit(key,limit,windowMs);if(!r.ok)return tooMany(r.retryAfter);}
  }
  const db=await supabase();
  switch(action){
   case 'logout':{await db.auth.signOut();return reply({ok:true});}
   case 'login':{
    const {identifier,password:secret}=z.object({identifier:z.string().min(1).max(254),password}).parse(body);
    const address=await resolveEmail(identifier);
    // Unknown login IDs and wrong passwords get the same answer, so the form never reveals who has an account.
    if(!address)return reply({error:SIGN_IN_FAILED},400);
    const {error}=await db.auth.signInWithPassword({email:address,password:secret});
    if(error)return reply({error:SIGN_IN_FAILED},400);
    return reply({ok:true});
   }
   case 'signup':{
    const creds=z.object({username:loginId,email,password}).parse(body);
    const service=serviceClient();
    if(service){const {data}=await service.rpc('login_email',{login_id:creds.username});if(data)return reply({error:'That login ID is taken. Try another.',field:'username'},409);}
    const {data,error}=await db.auth.signUp({email:creds.email,password:creds.password,options:{data:{username:creds.username},emailRedirectTo:new URL('/auth/callback',request.url).href}});
    if(error)return reply({error:'Unable to register. That login ID may be taken, or try signing in.'},400);
    return reply({confirmation:!data.session});
   }
   case 'reset':{
    // Always answer the same way, so the form never reveals whether an account exists.
    const address=email.parse(body.email);
    await db.auth.resetPasswordForEmail(address,{redirectTo:new URL('/auth/callback?next=/login?mode=update',request.url).href});
    return reply({ok:true});
   }
   case 'update':{
    const next=password.parse(body.password);const {data:{user}}=await db.auth.getUser();
    if(!user)return reply({error:'This reset link has expired. Request a new one.'},401);
    const {error}=await db.auth.updateUser({password:next});
    if(error)return reply({error:'Could not update your password. Try a different one.'},400);
    return reply({ok:true});
   }
   default:return reply({error:'Unknown action.'},400);
  }
 }catch(err){return failure(err,{invalid:'Check your details: a valid login ID or email, and a password of at least 8 characters.',fallback:'Sign-in is unavailable right now. Please try again shortly.'});}
}
