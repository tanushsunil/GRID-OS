import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {normaliseGridCode,formatGridCode} from '../lib/grid-code';

test('GRID numbers: forgiving input and readable display',()=>{
 for(const typed of ['482913','482 913','482-913',' 482 913 ','GRID 482913','grid-482-913'])assert.equal(normaliseGridCode(typed),'482913',typed);
 for(const bad of ['48291','4829134','48a913','',' '])assert.equal(normaliseGridCode(bad),null,bad);
 assert.equal(formatGridCode('482913'),'482 913');assert.equal(formatGridCode('007001'),'007 001');
});

test('database: every account gets one permanent, unique number; only the server can look it up',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create schema auth; create role anon; create role authenticated; create role service_role;
   create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb not null default '{}');
   create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
   create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
   grant usage on schema auth to authenticated,anon,service_role; grant execute on all functions in schema auth to authenticated,anon,service_role;`);
  await db.exec(readFileSync('supabase/migrations/001_grid.sql','utf8').replace('create extension if not exists pgcrypto;',''));
  // accounts that exist before the update get a number when it runs
  const existing=crypto.randomUUID();await db.query("insert into auth.users(id,email) values($1,'old@grid.media')",[existing]);
  await db.exec(readFileSync('supabase/migrations/007_login_codes.sql','utf8'));
  // and new accounts get one when they're created
  const ids=Array.from({length:40},()=>crypto.randomUUID());
  for(const [i,id] of ids.entries())await db.query('insert into auth.users(id,email) values($1,$2)',[id,`u${i}@grid.media`]);
  const rows=(await db.query<any>('select user_id,code from login_codes')).rows;
  assert.equal(rows.length,41);assert.ok(rows.every(r=>/^\d{6}$/.test(r.code)));assert.equal(new Set(rows.map(r=>r.code)).size,41,'all unique');
  const as=async(id:string)=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');};
  await as(existing);const mine=(await db.query<any>('select my_login_code() c')).rows[0].c;
  assert.equal(mine,rows.find(r=>r.user_id===existing).code);
  assert.equal((await db.query<any>('select my_login_code() c')).rows[0].c,mine,'permanent: same number every time');
  await assert.rejects(()=>db.query('select * from login_codes'),/permission denied/);
  await assert.rejects(()=>db.query('select login_code_email($1)',[mine]),/permission denied/);
  await db.exec('reset role; set role service_role');
  assert.equal((await db.query<any>('select login_code_email($1) e',[mine])).rows[0].e,'old@grid.media');
  const unused=['000000','999999','123456'].find(c=>!rows.some(r=>r.code===c))!;
  assert.equal((await db.query<any>('select login_code_email($1) e',[unused])).rows[0].e,null,'unknown numbers find nothing');
  await db.exec('reset role');
  assert.ok((await db.query<any>('select last_used_at from login_codes where code=$1',[mine])).rows[0].last_used_at,'use is recorded');
 }finally{await db.close();}
});
