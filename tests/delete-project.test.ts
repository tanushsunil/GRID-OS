import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

test('database: deleting a project removes its production work, never its invoices',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create schema auth; create role anon; create role authenticated; create role service_role;
   create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb not null default '{}');
   create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
   create function auth.jwt() returns jsonb language sql stable as $$ select '{"email":"a@b.co"}'::jsonb $$;
   grant usage on schema auth to authenticated; grant execute on all functions in schema auth to authenticated;`);
  for(const f of ['001_grid','002_project_cost','003_rentals','004_item_units','008_monthly_invoicing','011_start_dates','012_delete_project','013_delete_invoices'])await db.exec(readFileSync(`supabase/migrations/${f}.sql`,'utf8').replace('create extension if not exists pgcrypto;',''));
  const u=crypto.randomUUID(),editor=crypto.randomUUID();await db.query(`insert into auth.users(id,email) values($1,'a@b.co'),($2,'e@b.co')`,[u,editor]);
  const as=async(id:string)=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');};
  const one=async(sql:string,a:any[]=[])=>Object.values((await db.query<any>(sql,a)).rows[0]??{})[0] as any;
  await as(u);const w=await one("select bootstrap_workspace('Studio','Admin')");
  await db.exec('reset role');await db.query("insert into profiles(id,email,name) values($1,'e@b.co','Ed')",[editor]);await as(u);await db.query("select join_member($1,'e@b.co','Editor')",[w]);
  const c=await one("insert into clients(workspace_id,name) values($1,'Sommer Beauty') returning id",[w]);
  const mk=async(name:string)=>{const p=await one("insert into projects(workspace_id,name,client_id) values($1,$2,$3) returning id",[w,name,c]);
   const s=await one("insert into shoots(workspace_id,project_id,name,date,start_time) values($1,$2,'Shoot','2026-10-20','09:00') returning id",[w,p]);
   const d=await one("insert into deliverables(workspace_id,project_id,name,start_date,due_date) values($1,$2,'Reel','2026-10-21','2026-10-24') returning id",[w,p]);
   await db.query("insert into tasks(workspace_id,project_id,deliverable_id,name,due_date) values($1,$2,$3,'Edit','2026-10-22')",[w,p,d]);
   await db.query("insert into rentals(workspace_id,project_id,shoot_id,name,rate,quantity,days,status) values($1,$2,$3,'FX3',6500,1,1,'Booked')",[w,p,s]);
   return p;};
  const p1=await mk('Sommer');const p2=await mk('Keep me');
  // the editor isn't allowed
  await as(editor);await assert.rejects(()=>db.query('select delete_project($1,$2)',[w,p1]),/managers/);
  await as(u);const removed=await one('select delete_project($1,$2)',[w,p1]);
  assert.deepEqual(removed,{tasks:1,deliverables:1,shoots:1,rentals:1,invoices:0});
  for(const t of ['shoots','deliverables','tasks','rentals'])assert.equal(Number(await one(`select count(*) from ${t} where project_id=$1`,[p1])),0,t);
  assert.equal(Number(await one('select count(*) from projects where id=$1',[p1])),0);
  assert.equal(Number(await one('select count(*) from deliverables where project_id=$1',[p2])),1,'other projects untouched');
  // a project with an invoice is protected (nothing is deleted)
  await db.query("select save_document('invoices',$1,null,$2)",[w,JSON.stringify({name:'Inv',client_id:c,project_id:p2,issue_date:'2026-10-01',due_date:'2026-10-15',status:'Draft',items:[{service:'x',description:'',quantity:1,rate:100,tax:0}]})]);
  await assert.rejects(()=>db.query('select delete_project($1,$2)',[w,p2]),/has invoices/);
  assert.equal(Number(await one('select count(*) from shoots where project_id=$1',[p2])),1,'rolled back — nothing removed');
 }finally{await db.close();}
});
