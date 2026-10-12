import {configured,supabase,currentUser} from '@/lib/supabase';
import {billingSchema} from '@/lib/validation';
import {totals} from '@/lib/domain';
import {reply,readJson,rateLimit,tooMany,failure} from '@/lib/api';
import {queueDriveSync} from '@/lib/drive-hooks';
import {z} from 'zod';

/** Save or remove a project's monthly invoicing schedule. After saving, any invoice already due is created. */
export async function POST(request:Request){
 if(!configured())return reply({error:'Database is not connected.'},503);
 try{
  const body=await readJson(request,64*1024);const workspace_id=z.uuid().parse(body.workspace_id);
  const db=await supabase();const user=await currentUser(db);if(!user)return reply({error:'Please sign in again.'},401);
  const limited=rateLimit('write:'+user.id,120,60_000);if(!limited.ok)return tooMany(limited.retryAfter);
  if(body.remove){const {error}=await db.from('billing_schedules').delete().eq('workspace_id',workspace_id).eq('project_id',z.uuid().parse(body.project_id));if(error)return reply({error:'Couldn’t stop monthly invoicing. Check your access.'},400);return reply({ok:true});}
  const s=billingSchema.parse(body.schedule);
  if(s.discount>totals(s.items as any).subtotal)return reply({error:'Discount can’t be more than the monthly subtotal.'},400);
  // the invoice's client always follows the project's client
  const {data:project,error:pe}=await db.from('projects').select('client_id').eq('workspace_id',workspace_id).eq('id',s.project_id).single();
  if(pe||!project)return reply({error:'That project isn’t available.'},400);
  const {data,error}=await db.from('billing_schedules').upsert({...s,workspace_id,client_id:project.client_id},{onConflict:'workspace_id,project_id'}).select().single();
  if(error){console.error('[billing] save failed',error.code,error.message);return reply({error:error.code==='42P01'||error.code==='PGRST205'?'Monthly invoicing isn’t set up on the database yet. Run supabase/migrations/008_monthly_invoicing.sql.':'Couldn’t save monthly invoicing. Check your access and the details.'},400);}
  const {data:created}=await db.rpc('run_my_billing',{w:workspace_id});
  if(created)queueDriveSync(workspace_id);
  return reply({schedule:data,created:created??0});
 }catch(err){return failure(err,{invalid:'Check the monthly invoice details: at least one line item, a billing day from 1 to 31, and valid months.'});}
}
