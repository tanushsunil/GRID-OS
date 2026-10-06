import {configured,supabase,currentUser} from '@/lib/supabase';
import {z} from 'zod';
import {reply,readJson,rateLimit,tooMany,failure} from '@/lib/api';
const uuid=z.string().uuid();
export async function POST(request:Request){
 if(!configured())return reply({error:'Database is not connected.'},503);
 try{
 const body=await readJson(request,16*1024);const db=await supabase();const user=await currentUser(db);
 if(!user)return reply({error:'Please sign in.'},401);
 const limited=rateLimit('write:'+user.id,120,60_000);if(!limited.ok)return tooMany(limited.retryAfter);
 let result;
 switch(body.action){
 case 'bootstrap':result=await db.rpc('bootstrap_workspace',{workspace_name:z.string().trim().min(1).max(100).parse(body.name),full_name:z.string().max(100).parse(body.full_name)});break;
 case 'convert_estimate':result=await db.rpc('convert_estimate',{estimate:uuid.parse(body.id)});break;
 case 'convert_lead':result=await db.rpc('convert_lead',{lead:uuid.parse(body.id),make_project:!!body.make_project});break;
 case 'member':result=await db.rpc('join_member',{w:uuid.parse(body.workspace_id),member_email:z.email().parse(body.email),member_role:z.enum(['Admin','Manager','Editor']).parse(body.role)});break;
 case 'assign':result=body.remove?await db.from('project_members').delete().eq('workspace_id',uuid.parse(body.workspace_id)).eq('project_id',uuid.parse(body.project_id)).eq('user_id',uuid.parse(body.user_id)):await db.from('project_members').insert({workspace_id:uuid.parse(body.workspace_id),project_id:uuid.parse(body.project_id),user_id:uuid.parse(body.user_id)});break;
 case 'invoice_status':result=await db.from('invoices').update({status:z.enum(['Sent','Cancelled']).parse(body.status)}).eq('id',uuid.parse(body.id)).eq('workspace_id',uuid.parse(body.workspace_id)).select('id').single();break;
 case 'workspace':result=await db.from('workspaces').update(z.object({name:z.string().trim().min(1).max(100),billing_address:z.string().max(1000),tax_id:z.string().max(100)}).parse(body.data)).eq('id',uuid.parse(body.workspace_id)).select('id').single();break;
 default:return reply({error:'Unknown action.'},400);
 }
 if(result.error){console.error('[actions]',body.action,result.error.code,result.error.message);return reply({error:`This action could not be completed (${result.error.message}). Check your access and the record status. New team members must sign up first.`},400);}
 return reply({result:result.data});
 }catch(err){return failure(err,{invalid:'Check the details and try again.',fallback:'This action could not be completed right now. Please try again.'});}
}
