import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {LOGIN_ID,isEmailLike,normaliseLoginId} from '../lib/login-id';

test('login ID format',()=>{
 for(const ok of ['alex','a.b','studio_01','j-doe','abc'])assert.ok(LOGIN_ID.test(ok),ok);
 for(const bad of ['ab','Alex','.alex','alex.','al ex','al@ex','a'.repeat(31),''])assert.ok(!LOGIN_ID.test(bad),bad);
 assert.equal(normaliseLoginId('  Alex '),'alex');
 assert.ok(isEmailLike('alex@grid.media'));assert.ok(!isEmailLike('alex'));
});

test('usernames: unique profiles from sign-up, server-only email lookup',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create schema auth; create role authenticated; create role anon; create role service_role;
   create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb not null default '{}');
   create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
   create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
   grant usage on schema auth to authenticated,anon; grant execute on all functions in schema auth to authenticated;`);
  await db.exec(readFileSync('supabase/migrations/001_grid.sql','utf8').replace('create extension if not exists pgcrypto;',''));
  await db.exec(readFileSync('supabase/migrations/005_usernames.sql','utf8'));
  const a=crypto.randomUUID(),b=crypto.randomUUID(),c=crypto.randomUUID();
  await db.query(`insert into auth.users values($1,'alex@grid.media','{"username":" Alex "}')`,[a]);
  assert.equal((await db.query<{username:string}>('select username from profiles where id=$1',[a])).rows[0].username,'alex');
  // a taken login ID is rejected, so sign-up fails rather than creating a duplicate
  await assert.rejects(()=>db.query(`insert into auth.users values($1,'other@grid.media','{"username":"alex"}')`,[b]),/unique|duplicate/);
  await assert.rejects(()=>db.query(`insert into auth.users values($1,'bad@grid.media','{"username":"no spaces"}')`,[b]),/profiles_username_format/);
  // accounts created without a login ID still get a profile and can sign in by email
  await db.query(`insert into auth.users(id,email) values($1,'sam@grid.media')`,[c]);
  assert.equal((await db.query<{username:string|null}>('select username from profiles where id=$1',[c])).rows[0].username,null);
  // the resolver works for the server, but the public and signed-in roles can't call it
  await db.exec('set role service_role');
  assert.equal((await db.query<{e:string}>("select public.login_email(' ALEX ') e")).rows[0].e,'alex@grid.media');
  assert.equal((await db.query<{e:string|null}>("select public.login_email('nobody') e")).rows[0].e,null);
  for(const role of ['anon','authenticated']){await db.exec('reset role; set role '+role);await assert.rejects(()=>db.query("select public.login_email('alex')"),/permission denied/);}
 }finally{await db.close();}
});
