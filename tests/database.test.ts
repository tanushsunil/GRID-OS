import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {totals} from '../lib/domain';
test('PostgreSQL workflow, constraints, transactions and RLS',async()=>{
 const db=new PGlite();
 try{
 await db.exec(`create schema auth; create role authenticated; create table auth.users(id uuid primary key,email text); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('email','test@example.com') $$; grant usage on schema auth to authenticated; grant execute on all functions in schema auth to authenticated;`);
 await db.exec(readFileSync('supabase/migrations/001_grid.sql','utf8').replace('create extension if not exists pgcrypto;',''));
 const admin=crypto.randomUUID(),editor=crypto.randomUUID(),outsider=crypto.randomUUID();
 await db.query('insert into auth.users values($1,$2),($3,$4),($5,$6)',[admin,'admin@example.com',editor,'editor@example.com',outsider,'outside@example.com']);
 async function asUser(id:string){await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');}
 async function scalar(sql:string,args:any[]=[]){return Object.values((await db.query(sql,args)).rows[0] as any)[0] as any;}
 await asUser(admin);const w=await scalar("select bootstrap_workspace('Test Agency','Admin')");
 await db.query("select join_member($1,'editor@example.com','Editor')",[w]);
 const lead=await scalar("insert into leads(workspace_id,name,company,status) values($1,'Client contact','Client Brand','Won') returning id",[w]);
 const converted=await scalar('select convert_lead($1,false)',[lead]);const client=converted.client_id;
 const payload={name:'Test production',client_id:client,lead_id:lead,issue_date:'2026-10-01',valid_until:'2026-10-30',status:'Accepted',discount:4000,items:[{service:'Film',description:'',quantity:2,rate:15000,tax:18},{service:'Photos',description:'',quantity:1,rate:10000,tax:5}]};
 const estimate=await scalar("select save_document('estimates',$1,null,$2)",[w,JSON.stringify(payload)]);
 const project=await scalar('select convert_estimate($1)',[estimate]);assert.equal(await scalar('select convert_estimate($1)',[estimate]),project);
 await db.query('insert into project_members(workspace_id,project_id,user_id) values($1,$2,$3)',[w,project,editor]);
 const shoot=await scalar("insert into shoots(workspace_id,project_id,name,date,start_time,status) values($1,$2,'Shoot','2026-10-06','09:00','Confirmed') returning id",[w,project]);assert.ok(shoot);
 const deliverable=await scalar("insert into deliverables(workspace_id,project_id,name,assignee_id,status) values($1,$2,'Reel',$3,'Not Started') returning id",[w,project,editor]);
 const task=await scalar("insert into tasks(workspace_id,project_id,deliverable_id,name,assignee_id) values($1,$2,$3,'Rough cut',$4) returning id",[w,project,deliverable,editor]);
 const invoice=await scalar("select save_document('invoices',$1,null,$2)",[w,JSON.stringify({...payload,project_id:project,due_date:'2026-10-15',status:'Sent'})]);
 assert.equal(Number(await scalar('select invoice_total($1)',[invoice])),totals(payload.items,payload.discount).total);
 await db.query("insert into payments(workspace_id,invoice_id,amount,date) values($1,$2,10000,'2026-10-05')",[w,invoice]);
 assert.equal(Number(await scalar('select invoice_total($1)-(select sum(amount) from payments where invoice_id=$1)',[invoice])),31310);
 await assert.rejects(()=>db.query("insert into payments(workspace_id,invoice_id,amount,date) values($1,$2,50000,'2026-10-05')",[w,invoice]),/exceeds/);
 await assert.rejects(()=>db.query("update invoice_items set rate=1 where invoice_id=$1",[invoice]),/locked/);
 await db.query("insert into payments(workspace_id,invoice_id,amount,date) values($1,$2,31310,'2026-10-05')",[w,invoice]);
 assert.equal(Number(await scalar('select invoice_total($1)-(select sum(amount) from payments where invoice_id=$1)',[invoice])),0);
 await db.query("update projects set status='Completed' where id=$1",[project]);assert.ok(await scalar('select delivered_at from projects where id=$1',[project]));
 await asUser(editor);assert.equal(Number(await scalar('select count(*) from invoices')),0);assert.equal(Number(await scalar('select count(*) from projects')),1);
 await db.query("update tasks set status='Review' where id=$1",[task]);assert.equal(await scalar('select status from tasks where id=$1',[task]),'Review');
 await assert.rejects(()=>db.query("update tasks set name='Unauthorized change' where id=$1",[task]),/progress/);
 await assert.rejects(()=>db.query("insert into clients(workspace_id,name) values($1,'No access')",[w]),/row-level security/);
 await asUser(outsider);assert.equal(Number(await scalar('select count(*) from projects')),0);assert.equal(Number(await scalar('select count(*) from tasks')),0);await assert.rejects(()=>db.query('select convert_estimate($1)',[estimate]));
 const other=await scalar("select bootstrap_workspace('Other Agency','Other')");
 await assert.rejects(()=>db.query("insert into projects(workspace_id,name,client_id) values($1,'Cross workspace',$2)",[other,client]),/foreign key/);
 }finally{await db.close();}
});
