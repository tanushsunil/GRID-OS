import {configured,supabase} from '@/lib/supabase';
import {requestSchema,recordSchema} from '@/lib/validation';
import {entities,type Entity} from '@/lib/domain';
import {reply,readJson,rateLimit,tooMany,failure} from '@/lib/api';
import {z} from 'zod';
// Writes are capped per signed-in person, so a runaway script or loop can't flood the database.
const writeLimit=(user:string)=>rateLimit('write:'+user,120,60_000);
export async function GET(request:Request){
 if(!configured())return reply({error:'Database is not connected.'},503);
 try{
 const db=await supabase();const {data:{user}}=await db.auth.getUser();if(!user)return reply({error:'Please sign in again.'},401);
 const url=new URL(request.url);const requested=url.searchParams.get('workspace');const workspace=requested&&z.uuid().safeParse(requested).success?requested:null;
 const {data:memberships,error:membershipError}=await db.from('workspace_members').select('*,workspaces(*)').eq('user_id',user.id);
 if(membershipError)return reply({error:'Unable to load workspace. Check database setup.'},500);
 const membership=memberships?.find(m=>m.workspace_id===workspace)||memberships?.[0];
 if(!membership)return reply({onboarding:true,user:{id:user.id,email:user.email},memberships:[]});
 const w=membership.workspace_id;const manager=membership.role!=='Editor';
 const permitted=manager?entities:['projects','shoots','deliverables','tasks'] as Entity[];
 const results=await Promise.all(permitted.map(async entity=>{
 const select=entity==='estimates'?'*,items:estimate_items(*)':entity==='invoices'?'*,items:invoice_items(*)':'*';
 const {data,error}=await db.from(entity).select(select).eq('workspace_id',w).order('created_at',{ascending:false}).limit(500);
 if(error)throw new Error('Could not load records');return [entity,data];
 }));
 const [members,activity,projectMembers]=await Promise.all([
 db.from('workspace_members').select('*,profile:profiles(*)').eq('workspace_id',w),
 db.from('activity_logs').select('*').eq('workspace_id',w).order('created_at',{ascending:false}).limit(100),
 db.from('project_members').select('*').eq('workspace_id',w)
 ]);
 if(members.error||activity.error||projectMembers.error)return reply({error:'Unable to load workspace records.'},500);
 return reply({data:Object.fromEntries(entities.map(e=>[e,results.find(r=>r[0]===e)?.[1]||[]])),workspace:membership.workspaces,role:membership.role,user:{id:user.id,email:user.email},members:members.data,activity:activity.data,projectMembers:projectMembers.data,memberships});
 }catch(err){return failure(err,{fallback:'Unable to load workspace records. Please try again.'});}
}
export async function POST(request:Request){
 if(!configured())return reply({error:'Database is not connected.'},503);
 try{
 const raw=requestSchema.parse(await readJson(request));const data=recordSchema(raw.entity).parse(raw.data);
 const db=await supabase();const {data:{user}}=await db.auth.getUser();if(!user)return reply({error:'Please sign in again.'},401);
 const limited=writeLimit(user.id);if(!limited.ok)return tooMany(limited.retryAfter);
 let error;let result;
 if(['invoices','estimates'].includes(raw.entity)){
 const response=await db.rpc('save_document',{kind:raw.entity,w:raw.workspace_id,record_id:raw.id||null,payload:data});error=response.error;result={id:response.data};
 }else if(raw.entity==='payments'){
 const response=await db.from('payments').insert({...data,id:raw.id,workspace_id:raw.workspace_id}).select().single();error=response.error;result=response.data;
 }else{
 const query=raw.id?db.from(raw.entity).update(data).eq('workspace_id',raw.workspace_id).eq('id',raw.id):db.from(raw.entity).insert({...data,workspace_id:raw.workspace_id});
 const response=await query.select().single();error=response.error;result=response.data;
 }
 if(error)return reply({error:'Could not save. Check your permissions, linked records and any invoice balance. Issued invoices are locked.'},400);
 return reply({record:result});
 }catch(err){return failure(err,{invalid:'Please check required fields, dates and amounts.',fallback:'Unable to save right now. Please try again.'});}
}
export async function DELETE(request:Request){
 if(!configured())return reply({error:'Database is not connected.'},503);
 try{const {entity,id,workspace_id}=requestSchema.parse({...await readJson(request,16*1024),data:{}});
 if(!id||entity==='payments')return reply({error:'This record cannot be deleted.'},400);
 const db=await supabase();const {data:{user}}=await db.auth.getUser();if(!user)return reply({error:'Please sign in.'},401);
 const limited=writeLimit(user.id);if(!limited.ok)return tooMany(limited.retryAfter);
 const {data,error}=await db.from(entity).delete().eq('id',id).eq('workspace_id',workspace_id).select('id');
 if(error||!data?.length)return reply({error:'Cannot delete this record. It may be linked to other work, issued, or outside your access.'},400);
 return reply({ok:true});}catch(err){return failure(err,{invalid:'Unable to delete this record.',fallback:'Unable to delete this record right now.'});}
}
