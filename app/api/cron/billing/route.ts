import {serviceClient} from '@/lib/supabase';
import {reply} from '@/lib/api';
import {syncAllWorkspaces} from '@/lib/drive-sync';

/** Daily job (Vercel Cron, see vercel.json): prepares every monthly invoice that is due today.
 *  Vercel sends "Authorization: Bearer $CRON_SECRET"; anything else is refused. */
export const dynamic='force-dynamic';
export const maxDuration=300;
export async function GET(request:Request){
 const secret=process.env.CRON_SECRET;
 if(!secret||request.headers.get('authorization')!==`Bearer ${secret}`)return reply({error:'Not allowed.'},401);
 const service=serviceClient();if(!service)return reply({error:'SUPABASE_SECRET_KEY is not set.'},503);
 const {data,error}=await service.rpc('run_all_billing');
 if(error){console.error('[cron] billing failed',error.code,error.message);return reply({error:error.message},500);}
 console.log('[cron] monthly invoices created:',data);
 // then save new and changed invoices to each workspace's Google Drive folder
 const saved=await syncAllWorkspaces().catch(e=>{console.error('[cron] drive sync failed',e);return 0;});
 return reply({created:data??0,savedToDrive:saved});
}
