import {configured,supabase,currentUser} from '@/lib/supabase';
import {requestSchema,recordSchema} from '@/lib/validation';
import {entities,type Entity} from '@/lib/domain';
import {reply,readJson,rateLimit,tooMany,failure} from '@/lib/api';
import {queueDriveSync} from '@/lib/drive-hooks';
// Saving these changes an invoice PDF, so the Drive copy is refreshed afterwards.
const AFFECTS_INVOICE_PDF=new Set(['invoices','payments','clients']);
import {z} from 'zod';
// Writes are capped per signed-in person, so a runaway script or loop can't flood the database.
class LoadError extends Error{}
const writeLimit=(user:string)=>rateLimit('write:'+user,120,60_000);
export async function GET(request:Request){
 if(!configured())return reply({error:'Database is not connected.'},503);
 try{
 const db=await supabase();const user=await currentUser(db);if(!user)return reply({error:'Please sign in again.'},401);
 const url=new URL(request.url);const requested=url.searchParams.get('workspace');const workspace=requested&&z.uuid().safeParse(requested).success?requested:null;
 const {data:memberships,error:membershipError}=await db.from('workspace_members').select('*,workspaces(*)').eq('user_id',user.id);
 if(membershipError){console.error('[records] membership load failed',membershipError.code,membershipError.message);return reply({error:`Unable to load workspace (${membershipError.code||'error'}: ${membershipError.message}). Check database setup.`},500);}
 const membership=memberships?.find(m=>m.workspace_id===workspace)||memberships?.[0];
 if(!membership)return reply({onboarding:true,user:{id:user.id,email:user.email},memberships:[]});
 const w=membership.workspace_id;const manager=membership.role!=='Editor';
 const permitted=manager?entities:['projects','shoots','deliverables','tasks'] as Entity[];
 // Backup for the daily job: prepare any monthly invoice that's due before loading (managers only; harmless if
 // monthly invoicing isn't set up yet).
 if(manager){const {error:billingError}=await db.rpc('run_my_billing',{w});if(billingError&&billingError.code!=='PGRST202')console.error('[records] monthly invoicing failed',billingError.code,billingError.message);queueDriveSync(w);}
 // Records and team lists load together in one round, rather than one batch after another.
 const team=Promise.all([
 db.from('workspace_members').select('*,profile:profiles(*)').eq('workspace_id',w),
 db.from('activity_logs').select('*').eq('workspace_id',w).order('created_at',{ascending:false}).limit(100),
 db.from('project_members').select('*').eq('workspace_id',w),
 manager?db.from('billing_schedules').select('*').eq('workspace_id',w):Promise.resolve({data:[],error:null})
 ]);
 const results=await Promise.all(permitted.map(async entity=>{
 const select=entity==='estimates'?'*,items:estimate_items(*)':entity==='invoices'?'*,items:invoice_items(*)':'*';
 const {data,error}=await db.from(entity).select(select).eq('workspace_id',w).order('created_at',{ascending:false}).limit(500);
 if(error){console.error('[records] load failed',entity,error.code,error.message);throw new LoadError(`Could not load ${entity} (${error.code||'error'}: ${error.message}).`);}return [entity,data];
 }));
 const [members,activity,projectMembers,billing]=await team;
 const failed=members.error||activity.error||projectMembers.error;if(failed){console.error('[records] team load failed',failed.code,failed.message);return reply({error:`Unable to load workspace records (${failed.code||'error'}: ${failed.message}).`},500);}
 return reply({data:Object.fromEntries(entities.map(e=>[e,results.find(r=>r[0]===e)?.[1]||[]])),workspace:membership.workspaces,role:membership.role,user:{id:user.id,email:user.email},members:members.data,activity:activity.data,projectMembers:projectMembers.data,billing:billing.error?[]:billing.data,memberships});
 }catch(err){if(err instanceof LoadError)return reply({error:err.message},500);return failure(err,{fallback:'Unable to load workspace records. Please try again.'});}
}
export async function POST(request:Request){
 if(!configured())return reply({error:'Database is not connected.'},503);
 try{
 const raw=requestSchema.parse(await readJson(request));const data:Record<string,unknown>=recordSchema(raw.entity).parse(raw.data);
 // an empty start date is simply left out, so saving still works before the 011 update adds the column
 if(data.start_date==null&&(raw.entity==='tasks'||raw.entity==='deliverables'))delete data.start_date;
 const db=await supabase();const user=await currentUser(db);if(!user)return reply({error:'Please sign in again.'},401);
 const limited=writeLimit(user.id);if(!limited.ok)return tooMany(limited.retryAfter);
 let error;let result;let notice='';
 if(['invoices','estimates'].includes(raw.entity)){
 const response=await db.rpc('save_document',{kind:raw.entity,w:raw.workspace_id,record_id:raw.id||null,payload:data});error=response.error;result={id:response.data};
 }else if(raw.entity==='payments'){
 const response=await db.from('payments').insert({...data,id:raw.id,workspace_id:raw.workspace_id}).select().single();error=response.error;result=response.data;
 }else{
 const write=(row:Record<string,unknown>)=>(raw.id?db.from(raw.entity).update(row).eq('workspace_id',raw.workspace_id).eq('id',raw.id):db.from(raw.entity).insert({...row,workspace_id:raw.workspace_id})).select().single();
 let response=await write(data);
 // Before the 011 update the start-date column doesn't exist: save the rest (due date included) instead of failing.
 if(response.error?.code==='PGRST204'&&/start_date/.test(response.error.message)&&'start_date' in data){const {start_date:_,...rest}=data;response=await write(rest);if(!response.error)notice='Saved without the start date — run supabase/migrations/011_start_dates.sql in Supabase to keep start dates.';}
 error=response.error;result=response.data;
 }
 if(error){console.error('[records] save failed',raw.entity,error.code,error.message);return reply({error:`Could not save this ${raw.entity.replace(/s$/,'')}: ${error.message}`},400);}
 if(AFFECTS_INVOICE_PDF.has(raw.entity))queueDriveSync(raw.workspace_id);
 return reply({record:result,...(notice?{notice}:{})});
 }catch(err){return failure(err,{invalid:'Please check required fields, dates and amounts.',fallback:'Unable to save right now. Please try again.'});}
}
export async function DELETE(request:Request){
 if(!configured())return reply({error:'Database is not connected.'},503);
 try{const {entity,id,workspace_id}=requestSchema.parse({...await readJson(request,16*1024),data:{}});
 if(!id||entity==='payments')return reply({error:'This record cannot be deleted.'},400);
 const db=await supabase();const user=await currentUser(db);if(!user)return reply({error:'Please sign in.'},401);
 const limited=writeLimit(user.id);if(!limited.ok)return tooMany(limited.retryAfter);
 if(entity==='projects'){
  // a project goes together with its shoots, deliverables, tasks and rentals (not if it has invoices)
  const {data:removed,error:pe}=await db.rpc('delete_project',{w:workspace_id,p:id});
  if(pe){console.error('[records] delete project failed',pe.code,pe.message);return reply({error:pe.code==='PGRST202'?'Deleting projects needs a quick database update: run supabase/migrations/012_delete_project.sql in Supabase.':pe.message},400);}
  return reply({ok:true,removed});
 }
 const {data,error}=await db.from(entity).delete().eq('id',id).eq('workspace_id',workspace_id).select('id');
 if(error||!data?.length)return reply({error:error?.code==='23503'?'This is still linked to other work (for example tasks or invoices). Remove those links first, then delete it.':error?.message?.includes('locked')||error?.message?.includes('drafts')?'Only draft invoices can be deleted.':'This couldn’t be deleted — it may already be gone or be outside your access.'},400);
 if(AFFECTS_INVOICE_PDF.has(entity))queueDriveSync(workspace_id);
 return reply({ok:true});}catch(err){return failure(err,{invalid:'Unable to delete this record.',fallback:'Unable to delete this record right now.'});}
}
