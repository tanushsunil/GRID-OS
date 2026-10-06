import {configured,supabase,currentUser} from '@/lib/supabase';
import {recordSchema,itemSchema} from '@/lib/validation';
import {reply,readJson,rateLimit,tooMany,failure} from '@/lib/api';
import {z} from 'zod';

const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const invoice=z.object({
 number:z.string().trim().max(50).default(''),name:z.string().trim().min(1).max(200),
 client:z.string().trim().min(1).max(200),project:z.string().trim().min(1).max(200),
 issue_date:date,due_date:date,discount:z.number().min(0).max(100000000).default(0),
 notes:z.string().max(20000).default(''),payment_terms:z.string().max(20000).default(''),
 status:z.enum(['Draft','Sent','Cancelled']),amount_paid:z.number().min(0).max(100000000).default(0),
 payment_date:date.nullable().default(null),payment_method:z.string().max(100).default(''),
 items:z.array(itemSchema).min(1).max(100),
}).refine(v=>v.due_date>=v.issue_date,{message:'Due date must follow the issue date'})
 .refine(v=>v.amount_paid===0||v.status==='Sent',{message:'Only sent invoices can have payments'});
const body=z.object({entity:z.enum(['clients','leads','invoices']),workspace_id:z.uuid(),rows:z.array(z.unknown()).min(1).max(2000)});

/** Imports a batch of clients, leads or invoices in one go. Every row is checked again here, and a batch
 *  is saved all-or-nothing, so a failed import never leaves half its rows behind. */
export async function POST(request:Request){
 if(!configured())return reply({error:'Database is not connected.'},503);
 try{
  const {entity,workspace_id,rows}=body.parse(await readJson(request,5*1024*1024));
  const db=await supabase();const user=await currentUser(db);if(!user)return reply({error:'Please sign in again.'},401);
  const limited=rateLimit('import:'+user.id,20,60_000);if(!limited.ok)return tooMany(limited.retryAfter);
  if(entity==='invoices'){
   const invoices=rows.map(r=>invoice.parse(r));
   const {data,error}=await db.rpc('import_invoices',{w:workspace_id,invoices});
   if(error){console.error('[import] invoices failed',error.code,error.message);return reply({error:error.code==='PGRST202'?'Invoice import isn’t set up on the database yet. Run supabase/migrations/006_import.sql in the Supabase SQL Editor.':error.code==='23505'?'One of these invoice numbers already exists in GRID OS. Nothing was imported.':`Nothing was imported: ${error.message}`},400);}
   return reply({imported:data});
  }
  const schema=recordSchema(entity);
  const records=rows.map(r=>({...schema.parse(r),workspace_id}));
  const {error,count}=await db.from(entity).insert(records,{count:'exact'});
  if(error){console.error('[import]',entity,'failed',error.code,error.message);return reply({error:`Nothing was imported: ${error.message}`},400);}
  return reply({imported:{[entity]:count??records.length}});
 }catch(err){return failure(err,{invalid:'Some rows aren’t valid. Nothing was imported — check the preview and try again.',fallback:'The import couldn’t be completed. Nothing was imported.'});}
}
