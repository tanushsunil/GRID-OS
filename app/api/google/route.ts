import {configured,supabase,currentUser,serviceClient} from '@/lib/supabase';
import {googleConfigured,accessToken,folderInfo,revoke,needsReconnect} from '@/lib/google-drive';
import {queueDriveSync} from '@/lib/drive-hooks';
import {reply,readJson,rateLimit,tooMany,failure} from '@/lib/api';
import {z} from 'zod';

/** Google Drive invoice folder: status, picker token, choose folder, sync now, disconnect. Managers only. */
export async function POST(request:Request){
 if(!configured())return reply({error:'Database is not connected.'},503);
 try{
  const body=await readJson(request,8*1024);const w=z.uuid().parse(body.workspace_id);
  const db=await supabase();const user=await currentUser(db);if(!user)return reply({error:'Please sign in again.'},401);
  const limited=rateLimit('google:'+user.id,60,60_000);if(!limited.ok)return tooMany(limited.retryAfter);
  const ready=googleConfigured()&&!!serviceClient();
  const {data:status,error:se}=await db.rpc('drive_status',{w});
  if(se)return reply({configured:ready,setup:se.code!=='PGRST202',connected:false});
  if(!status)return reply({error:'Only managers and admins can manage Google Drive.'},403);
  if(body.action==='status')return reply({...status,configured:ready,setup:true,pickerKey:!!process.env.NEXT_PUBLIC_GOOGLE_API_KEY});
  const service=serviceClient();if(!ready||!service)return reply({error:'Google Drive isn’t set up on the server yet.'},503);
  const {data:conn}=await service.from('drive_connections').select('refresh_token,folder_id').eq('workspace_id',w).maybeSingle();
  if(!conn)return reply({error:'Connect Google Drive first.'},400);
  switch(body.action){
   case 'token':{ // short-lived token for Google's folder picker (drive.file scope only)
    try{return reply({token:await accessToken(conn.refresh_token)});}
    catch(e){return reply({error:needsReconnect(e)?'Google Drive access expired — connect it again.':'Couldn’t reach Google right now.'},needsReconnect(e)?401:503);}
   }
   case 'folder':{
    const id=z.string().regex(/^[\w-]{10,200}$/).parse(body.folder_id);
    const info=await folderInfo(await accessToken(conn.refresh_token),id).catch(()=>null);
    if(!info||info.trashed||info.mimeType!=='application/vnd.google-apps.folder')return reply({error:'GRID OS can’t open that folder. Choose it again with the picker.'},400);
    // a new folder starts fresh: every invoice is saved into it
    await service.from('drive_connections').update({folder_id:info.id,folder_name:info.name,last_error:null}).eq('workspace_id',w);
    if(info.id!==conn.folder_id)await service.from('drive_files').delete().eq('workspace_id',w);
    queueDriveSync(w);
    return reply({folder_id:info.id,folder_name:info.name});
   }
   case 'sync':{if(!conn.folder_id)return reply({error:'Choose the invoice folder first.'},400);queueDriveSync(w);return reply({ok:true});}
   case 'disconnect':{
    await revoke(conn.refresh_token);
    await service.from('drive_files').delete().eq('workspace_id',w);
    await service.from('drive_connections').delete().eq('workspace_id',w);
    return reply({ok:true});
   }
   default:return reply({error:'Unknown action.'},400);
  }
 }catch(err){return failure(err,{invalid:'Check the details and try again.',fallback:'Google Drive is unavailable right now. Please try again.'});}
}
