import {configured,supabase,serviceClient,currentUser} from '@/lib/supabase';
import {normaliseGridCode} from '@/lib/grid-code';
import {LOGIN_ID,isEmailLike,normaliseLoginId} from '@/lib/login-id';
import {reply,readJson,rateLimit,clientIp,tooMany,failure} from '@/lib/api';
import {z} from 'zod';
const email=z.email().max(254);
const password=z.string().min(8).max(128);
const loginId=z.string().transform(normaliseLoginId).pipe(z.string().regex(LOGIN_ID));
const SIGN_IN_FAILED='Unable to sign in. Check your email and password.';
/** Explains auth-service refusals that don't reveal whether a particular account exists. */
const SIGNUP_ERRORS:Record<string,string>={
 over_email_send_rate_limit:'Too many sign-up emails were sent recently. Wait about an hour, then try again — or ask your admin to confirm your account.',
 over_request_rate_limit:'Too many attempts. Please wait a few minutes and try again.',
 email_address_not_authorized:'This server can’t send email to that address yet. Ask your admin to set up email sending or confirm your account.',
 email_address_invalid:'That email address can’t be used. Try a different one.',
 weak_password:'That password is too easy to guess. Choose a longer one with a mix of characters.',
 signup_disabled:'New accounts are turned off for this workspace. Ask your admin for access.',
 email_provider_disabled:'New accounts are turned off for this workspace. Ask your admin for access.',
 email_exists:'An account with this email already exists. Use Sign in instead.',
 user_already_exists:'An account with this email already exists. Use Sign in instead.',
 unexpected_failure:'That login ID is taken. Choose another one.',
};
// Brute-force guards: per address, and per account being tried (so rotating addresses doesn't help).
const LIMITS={login:[10,60_000],code:[10,60_000],signup:[5,600_000],reset:[5,600_000],update:[10,600_000]} as const;
const CODE_FAILED='That GRID number isn’t right. Check the six digits — you’ll find yours in Settings.';
const NEEDS_SERVER_KEY='Sign in with GRID needs the server key (SUPABASE_SECRET_KEY) to be set on the server.';

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
  const body=await readJson(request,8*1024);const action=body.action as keyof typeof LIMITS|'logout'|'code_status';
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
    if(error?.code==='email_not_confirmed')return reply({error:'This account hasn’t been confirmed yet. Open the link in your confirmation email, or ask your admin to confirm it.'},400);
    if(error?.code==='over_request_rate_limit')return reply({error:SIGNUP_ERRORS.over_request_rate_limit},429);
    if(error){
     // Logged without the password, so the Vercel logs show why sign-in failed.
     console.error('[auth] sign-in refused',error.code,error.status,error.message);
     if(error.code==='invalid_credentials')return reply({error:SIGN_IN_FAILED},400);
     // Anything else is a setup problem, not a wrong password — say so, with Supabase's reason.
     const known:Record<string,string>={
      captcha_failed:'Supabase CAPTCHA protection is blocking sign-in. Turn it off in Supabase → Authentication → Attack Protection, or add CAPTCHA to this app.',
      email_provider_disabled:'Email sign-in is switched off in Supabase. Turn it on in Authentication → Sign In / Providers → Email.',
      provider_disabled:'Email sign-in is switched off in Supabase. Turn it on in Authentication → Sign In / Providers → Email.',
      user_banned:'This account has been suspended. Ask your admin.',
      over_request_rate_limit:'Too many attempts. Please wait a few minutes and try again.',
     };
     return reply({error:known[error.code??'']??`Sign-in was refused by the server (${error.code||error.status||'unknown'}: ${error.message}). Your password wasn’t the problem.`},error.status===429?429:503);
    }
    return reply({ok:true});
   }
   case 'code':{
    // Sign in with a personal GRID code: find the account, then mint and immediately redeem a one-time
    // sign-in token for it on the server (no email is sent), which sets the normal session cookies.
    const service=serviceClient();if(!service)return reply({error:NEEDS_SERVER_KEY},503);
    // six digits are guessable, so attempts are also capped across the whole site, not just per device
    const all=rateLimit('code:all',60,60_000);if(!all.ok)return tooMany(all.retryAfter);
    const canonical=normaliseGridCode(String(body.code??''));if(!canonical)return reply({error:CODE_FAILED},400);
    const {data:address,error:lookup}=await service.rpc('login_code_email',{code:canonical});
    if(lookup){console.error('[auth] code lookup failed',lookup.code,lookup.message);return reply({error:lookup.code==='PGRST202'?'Sign in with GRID isn’t set up on the database yet. Run supabase/migrations/007_login_codes.sql.':'Sign-in is unavailable right now. Please try again shortly.'},503);}
    if(typeof address!=='string')return reply({error:CODE_FAILED},400);
    const link=await service.auth.admin.generateLink({type:'magiclink',email:address});
    const token_hash=link.data?.properties?.hashed_token;
    if(link.error||!token_hash){console.error('[auth] code sign-in link failed',link.error?.code,link.error?.message);return reply({error:'Sign-in is unavailable right now. Please try again shortly.'},503);}
    const {error}=await db.auth.verifyOtp({type:'magiclink',token_hash});
    if(error){console.error('[auth] code sign-in failed',error.code,error.message);return reply({error:'Sign-in is unavailable right now. Please try again shortly.'},503);}
    return reply({ok:true});
   }
   case 'code_status':{
    if(!(await currentUser(db)))return reply({error:'Please sign in again.'},401);
    const {data,error}=await db.rpc('my_login_code');
    if(error){console.error('[auth] code status failed',error.code,error.message);return reply({code:null,available:false,setup:error.code!=='PGRST202'});}
    return reply({code:typeof data==='string'?data:null,available:!!serviceClient(),setup:true});
   }
   case 'signup':{
    const creds=z.object({username:loginId.optional(),email,password}).parse({...body,username:body.username||undefined});
    const service=serviceClient();
    if(service&&creds.username){const {data}=await service.rpc('login_email',{login_id:creds.username});if(data)return reply({error:'That login ID is taken. Try another.',field:'username'},409);}
    // With the server key, accounts are created already confirmed and signed straight in, so sign-up never
    // depends on an email arriving. Set GRID_REQUIRE_EMAIL_CONFIRMATION=true to send confirmation emails instead.
    if(service&&process.env.GRID_REQUIRE_EMAIL_CONFIRMATION!=='true'){
     const created=await service.auth.admin.createUser({email:creds.email,password:creds.password,email_confirm:true,user_metadata:creds.username?{username:creds.username}:{}});
     if(created.error){
      console.error('[auth] sign-up refused',created.error.code,created.error.message);
      const field=created.error.code==='unexpected_failure'?{field:'username'}:{};
      return reply({error:SIGNUP_ERRORS[created.error.code??'']??'Unable to create the account. If you’ve signed up before, use Sign in instead.',...field},400);
     }
     const {error}=await db.auth.signInWithPassword({email:creds.email,password:creds.password});
     return reply({confirmation:false,signedIn:!error});
    }
    const {data,error}=await db.auth.signUp({email:creds.email,password:creds.password,options:{data:creds.username?{username:creds.username}:{},emailRedirectTo:new URL('/auth/callback',request.url).href}});
    if(error){
     console.error('[auth] sign-up refused',error.code,error.message);
     const field=error.code==='unexpected_failure'?{field:'username'}:{};
     return reply({error:SIGNUP_ERRORS[error.code??'']??'Unable to create the account. If you’ve signed up before, use Sign in instead.',...field},error.status===429?429:400);
    }
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
 }catch(err){return failure(err,{invalid:'Enter a valid email and a password of at least 8 characters.',fallback:'Sign-in is unavailable right now. Please try again shortly.'});}
}
