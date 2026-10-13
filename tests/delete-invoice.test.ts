import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

test('database: invoices can be deleted (drafts by managers, sent ones by admins) and stay deleted',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create schema auth; create role anon; create role authenticated; create role service_role;
   create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb not null default '{}');
   create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
   create function auth.jwt() returns jsonb language sql stable as $$ select '{"email":"a@b.co"}'::jsonb $$;
   grant usage on schema auth to authenticated; grant execute on all functions in schema auth to authenticated;`);
  for(const f of ['001_grid','002_project_cost','003_rentals','004_item_units','008_monthly_invoicing','011_start_dates','012_delete_project','013_delete_invoices'])await db.exec(readFileSync(`supabase/migrations/${f}.sql`,'utf8').replace('create extension if not exists pgcrypto;',''));
  const u=crypto.randomUUID(),mgr=crypto.randomUUID();await db.query(`insert into auth.users(id,email) values($1,'a@b.co'),($2,'m@b.co')`,[u,mgr]);
  const as=async(id:string)=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');};
  const one=async(sql:string,a:any[]=[])=>Object.values((await db.query<any>(sql,a)).rows[0]??{})[0] as any;
  const count=async(sql:string,a:any[]=[])=>Number(await one(sql,a));
  await as(u);const w=await one("select bootstrap_workspace('Studio','Admin')");
  await db.exec('reset role');await db.query("insert into profiles(id,email,name) values($1,'m@b.co','Mo')",[mgr]);await as(u);await db.query("select join_member($1,'m@b.co','Manager')",[w]);
  const c=await one("insert into clients(workspace_id,name) values($1,'Sommer') returning id",[w]);
  const p=await one("insert into projects(workspace_id,name,client_id) values($1,'P',$2) returning id",[w,c]);
  const invoice=(status='Draft')=>one("select save_document('invoices',$1,null,$2)",[w,JSON.stringify({name:'Inv',client_id:c,project_id:p,issue_date:'2026-10-01',due_date:'2026-10-15',status,items:[{service:'Reel',description:'',quantity:1,rate:1000,tax:0}]})]);

  // a draft with line items (this used to fail: "Issued invoice items are locked")
  await as(mgr);const draft=await invoice();
  assert.deepEqual(await one('select delete_invoice($1,$2)',[w,draft]),{payments:0});
  assert.equal(await count('select count(*) from invoice_items where invoice_id=$1',[draft]),0);

  // a sent, part-paid invoice: managers can't, admins can (payments go with it)
  await as(u);const sent=await invoice();await db.query("update invoices set status='Sent' where id=$1",[sent]);
  await db.query("insert into payments(workspace_id,invoice_id,amount,date) values($1,$2,500,'2026-10-02')",[w,sent]);
  await as(mgr);await assert.rejects(()=>db.query('select delete_invoice($1,$2)',[w,sent]),/Only admins/);
  await assert.rejects(()=>db.query('delete from invoices where id=$1',[sent]),/Only drafts/,'a plain delete still refuses issued invoices');
  await assert.rejects(()=>db.query('delete from payments where invoice_id=$1',[sent]),/immutable/,'payments still can\'t be removed on their own');
  await as(u);assert.deepEqual(await one('select delete_invoice($1,$2)',[w,sent]),{payments:1});
  assert.equal(await count('select count(*) from invoices where id=$1',[sent]),0);

  // a deleted monthly invoice is skipped, not recreated
  await db.query("insert into billing_schedules(workspace_id,project_id,client_id,items,starts_on) values($1,$2,$3,$4,'2026-09')",[w,p,c,JSON.stringify([{service:'Retainer',quantity:1,rate:5000,tax:0}])]);
  await db.exec('reset role');assert.equal(await one("select run_billing(null,'2026-10-30')"),2);await as(u);
  const sept=await one("select id from invoices where billing_period='2026-09'");
  await one('select delete_invoice($1,$2)',[w,sept]);
  await db.exec('reset role');assert.equal(await one("select run_billing(null,'2026-10-30')"),0,'September stays deleted');
  assert.deepEqual(await one('select skipped from billing_schedules'),['2026-09']);await as(u);

  // a project with invoices: only when asked, then everything goes in one step
  await db.query("insert into shoots(workspace_id,project_id,name,date,start_time) values($1,$2,'Shoot','2026-10-20','09:00')",[w,p]);
  await assert.rejects(()=>db.query('select delete_project($1,$2)',[w,p]),/has invoices/);
  const removed=await one('select delete_project($1,$2,true)',[w,p]);
  assert.equal(removed.invoices,1);assert.equal(removed.shoots,1);
  assert.equal(await count('select count(*) from invoices where project_id=$1',[p]),0);
  assert.equal(await count('select count(*) from projects where id=$1',[p]),0);
 }finally{await db.close();}
});
