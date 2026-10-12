import {NextResponse} from 'next/server';
import {cookies} from 'next/headers';
import {configured,supabase,currentUser,serviceClient} from '@/lib/supabase';
import {exchangeCode,revoke} from '@/lib/google-drive';

/** Google sends the browser back here after sign-in. Stores the connection (server only) and returns to Settings. */
export async function GET(request:Request){
 const url=new URL(request.url);const back=(q:string)=>{const r=NextResponse.redirect(new URL(`/settings?drive=${q}`,url.origin));r.cookies.delete({name:'grid-google-state',path:'/api/google'});return r;};
 if(url.searchParams.get('error'))return back('cancelled');
 const jar=await cookies();const [state,workspace]=(jar.get('grid-google-state')?.value||'').split('.');
 const code=url.searchParams.get('code');
 if(!configured()||!state||!workspace||!code||url.searchParams.get('state')!==state)return back('error');
 const db=await supabase();const user=await currentUser(db);if(!user)return NextResponse.redirect(new URL('/login',url.origin));
 const {data:status}=await db.rpc('drive_status',{w:workspace});if(!status)return back('not-allowed');
 const service=serviceClient();if(!service)return back('not-configured');
 try{
  const t=await exchangeCode(code,new URL('/api/google/callback',url.origin).href);
  if(!t.refresh_token)return back('error');
  const {data:prev}=await service.from('drive_connections').select('refresh_token,google_email,folder_id,folder_name').eq('workspace_id',workspace).maybeSingle();
  // same Google account: keep the chosen folder; a different account can't see it, so the folder must be picked again
  const keep=prev&&prev.google_email&&prev.google_email===t.email;
  const {error}=await service.from('drive_connections').upsert({workspace_id:workspace,refresh_token:t.refresh_token,google_email:t.email,connected_by:user.id,connected_at:new Date().toISOString(),folder_id:keep?prev.folder_id:null,folder_name:keep?prev.folder_name:null,last_error:null,sync_lease:null});
  if(error){console.error('[drive] save connection failed',error.code,error.message);return back(error.code==='42P01'||error.code==='PGRST205'?'not-set-up':'error');}
  if(prev?.refresh_token&&prev.refresh_token!==t.refresh_token)await revoke(prev.refresh_token);
  if(!keep)await service.from('drive_files').delete().eq('workspace_id',workspace);
  return back('connected');
 }catch(err){console.error('[drive] connect failed',(err as Error).message);return back('error');}
}
