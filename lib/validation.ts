import {z} from 'zod';
import {entities,fields,statuses,type Entity} from './domain';
const uuid=z.string().uuid();
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(x=>!isNaN(Date.parse(x))&&new Date(x).toISOString().slice(0,10)===x,'Enter a valid date');
export const itemSchema=z.object({service:z.string().trim().min(1).max(200),description:z.string().max(2000).default(''),quantity:z.coerce.number().positive().max(100000),unit:z.string().trim().max(40).optional().default(''),rate:z.coerce.number().nonnegative().max(100000000),tax:z.coerce.number().min(0).max(100)});
export function recordSchema(entity:Entity){
 const shape:Record<string,z.ZodType>={};
 for(const field of fields[entity]){
 let rule:z.ZodType=field.relation?uuid:field.type==='date'?date:field.type==='number'?z.coerce.number().min(0).max(100000000):field.type==='email'?z.email():field.options?z.enum(field.options as [string,...string[]]):field.type==='time'?z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/):z.string().trim().max(field.type==='textarea'?20000:500);
 if(field.required&&field.type!=='number'&&!field.relation&&field.type!=='date')rule=z.string().trim().min(1).max(500);
 shape[field.key]=field.required?rule:z.preprocess(v=>v===''||v===undefined?null:v,rule.nullable());
 }
 if(entity in statuses)shape.status=z.enum(statuses[entity as keyof typeof statuses] as [string,...string[]]);
 if(['estimates','invoices'].includes(entity))shape.items=z.array(itemSchema).min(1).max(100);
 if(entity==='payments')shape.amount=z.coerce.number().positive().max(100000000);
 return z.object(shape).superRefine((r,ctx)=>{
 if(r.start_date&&r.deadline&&String(r.deadline)<String(r.start_date))ctx.addIssue({code:'custom',path:['deadline'],message:'Deadline must follow the start date'});
 if(r.issue_date&&(r.due_date||r.valid_until)&&String(r.due_date||r.valid_until)<String(r.issue_date))ctx.addIssue({code:'custom',path:['due_date'],message:'End date must follow the issue date'});
 if(r.start_date&&r.end_date&&String(r.end_date)<String(r.start_date))ctx.addIssue({code:'custom',path:['end_date'],message:'Return date must be on or after pickup'});
 if(r.start_time&&r.end_time&&String(r.end_time)<=String(r.start_time))ctx.addIssue({code:'custom',path:['end_time'],message:'End time must follow start time'});
 if(r.delivery_url){try{const u=new URL(String(r.delivery_url));if(!['https:','http:'].includes(u.protocol))throw new Error();}catch{ctx.addIssue({code:'custom',path:['delivery_url'],message:'Enter a valid HTTPS delivery link'});}}
 });
}
export const requestSchema=z.object({entity:z.enum(entities as [Entity,...Entity[]]),id:uuid.optional(),workspace_id:uuid,data:z.record(z.string(),z.unknown())});
