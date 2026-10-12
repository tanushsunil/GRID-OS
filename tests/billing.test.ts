import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {runDate,duePeriods,nextRun,invoiceFor,periodLabel,addMonths,type BillingSchedule} from '../lib/billing';

const schedule=(x:Partial<BillingSchedule>={}):BillingSchedule=>({id:'s1',project_id:'p1',client_id:'c1',items:[{service:'Monthly content',description:'',quantity:1,rate:50000,tax:18}],discount:0,day:29,due_days:7,starts_on:'2026-10',ends_on:null,active:true,...x});

test('billing dates: the 29th, short months, month arithmetic',()=>{
 assert.equal(runDate('2026-10',29),'2026-10-29');
 assert.equal(runDate('2027-02',29),'2027-02-28');assert.equal(runDate('2028-02',29),'2028-02-29');assert.equal(runDate('2026-04',31),'2026-04-30');
 assert.equal(addMonths('2026-12',1),'2027-01');assert.equal(addMonths('2026-01',-1),'2025-12');assert.equal(addMonths('2026-10',-11),'2025-11');
 assert.equal(periodLabel('2026-10'),'October 2026');
});

test('which months are due, catch-up, pause and end month',()=>{
 const s=schedule();
 assert.deepEqual(duePeriods(s,'2026-10-28',new Set()),[]);
 assert.deepEqual(duePeriods(s,'2026-10-29',new Set()),['2026-10']);
 assert.deepEqual(duePeriods(s,'2026-10-29',new Set(['2026-10'])),[],'never twice');
 assert.deepEqual(duePeriods(s,'2027-01-05',new Set(['2026-10'])),['2026-11','2026-12'],'missed months are caught up');
 assert.deepEqual(duePeriods(schedule({ends_on:'2026-11'}),'2027-03-30',new Set()),['2026-10','2026-11']);
 assert.deepEqual(duePeriods(schedule({active:false}),'2026-12-30',new Set()),[]);
 assert.equal(duePeriods(schedule({starts_on:'2024-01'}),'2026-10-30',new Set()).length,12,'catch-up is capped at 12 months');
 assert.deepEqual(nextRun(s,'2026-10-12',new Set()),{period:'2026-10',date:'2026-10-29'});
 assert.deepEqual(nextRun(s,'2026-10-30',new Set(['2026-10'])),{period:'2026-11',date:'2026-11-29'});
 assert.equal(nextRun(schedule({ends_on:'2026-10'}),'2026-10-30',new Set(['2026-10'])),null);
 const inv=invoiceFor(s,'2026-10','Northstar retainer');
 assert.equal(inv.name,'Northstar retainer — October 2026');assert.equal(inv.issue_date,'2026-10-29');assert.equal(inv.due_date,'2026-11-05');assert.equal(inv.status,'Draft');assert.equal(inv.billing_period,'2026-10');
});

test('database: drafts are created on the billing day, once per month, with their items',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create schema auth; create role anon; create role authenticated; create role service_role;
   create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb not null default '{}');
   create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
   create function auth.jwt() returns jsonb language sql stable as $$ select '{"email":"a@b.co"}'::jsonb $$;
   grant usage on schema auth to authenticated,service_role; grant execute on all functions in schema auth to authenticated,service_role;`);
  for(const f of ['001_grid','002_project_cost','003_rentals','004_item_units','008_monthly_invoicing'])await db.exec(readFileSync(`supabase/migrations/${f}.sql`,'utf8').replace('create extension if not exists pgcrypto;',''));
  const u=crypto.randomUUID();await db.query(`insert into auth.users(id,email) values($1,'a@b.co')`,[u]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[u]);await db.exec('set role authenticated');
  const one=async(sql:string,args:any[]=[])=>Object.values((await db.query<any>(sql,args)).rows[0])[0] as any;
  const w=await one("select bootstrap_workspace('Studio','Admin')");
  const c=await one("insert into clients(workspace_id,name) values($1,'Northstar') returning id",[w]);
  const p=await one("insert into projects(workspace_id,name,client_id) values($1,'Northstar retainer',$2) returning id",[w,c]);
  await db.query(`insert into billing_schedules(workspace_id,project_id,client_id,items,day,due_days,starts_on) values($1,$2,$3,$4,29,7,'2026-09')`,[w,p,c,JSON.stringify([{service:'Monthly content',quantity:1,rate:50000,tax:18},{service:'Shoot day',quantity:1,rate:20000,tax:18,unit:'Day'}])]);
  await db.exec('reset role');
  const run=(day:string)=>one('select run_billing(null,$1::date)',[day]);
  assert.equal(await run('2026-09-28'),0,'not before the 29th');
  assert.equal(await run('2026-09-29'),1);
  assert.equal(await run('2026-09-30'),0,'never twice for the same month');
  assert.equal(await run('2026-12-01'),2,'October and November caught up');
  const rows=(await db.query<any>("select name,issue_date::text d,due_date::text due,status,billing_period,invoice_total(id) total from invoices order by billing_period")).rows;
  assert.deepEqual(rows.map(r=>[r.billing_period,r.d,r.due,r.status,Number(r.total)]),[['2026-09','2026-09-29','2026-10-06','Draft',82600],['2026-10','2026-10-29','2026-11-05','Draft',82600],['2026-11','2026-11-29','2026-12-06','Draft',82600]]);
  assert.equal(rows[0].name,'Northstar retainer — September 2026');
  assert.equal(Number(await one("select count(*) from invoice_items")),6);
  // February: prepared on the 28th
  assert.equal(await run('2027-02-28'),3);assert.equal(await one("select issue_date::text from invoices where billing_period='2027-02'"),'2027-02-28');
  // a manager can run it for their own workspace; a non-member gets nothing
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[u]);await db.exec('set role authenticated');
  assert.equal(await one('select run_my_billing($1)',[w]),0);
  const outsider=crypto.randomUUID();await db.exec('reset role');await db.query(`insert into auth.users(id,email) values($1,'x@y.co')`,[outsider]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[outsider]);await db.exec('set role authenticated');
  assert.equal(await one('select run_my_billing($1)',[w]),0);
  await assert.rejects(()=>db.query('select run_billing(null,current_date)'),/permission denied/);
 }finally{await db.close();}
});
