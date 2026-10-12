import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {monthFolder,driveFileName,contentHash,syncWorkspaceInvoices} from '../lib/drive-sync';

process.env.GOOGLE_CLIENT_ID='test-client';process.env.GOOGLE_CLIENT_SECRET='test-secret';

/* ---------- a fake Google Drive (only what GRID OS uses) ---------- */
type File={id:string;name:string;mime:string;parents:string[];trashed:boolean;bytes?:number;content?:string};
function fakeDrive(){
 const files=new Map<string,File>();let n=0;const calls:string[]=[];
 files.set('ROOT',{id:'ROOT',name:'GRID Invoices',mime:'application/vnd.google-apps.folder',parents:[],trashed:false});
 const parse=(body:Uint8Array,type:string)=>{const b=type.split('boundary=')[1];const text=Buffer.from(body).toString('latin1');const parts=text.split('--'+b);const meta=JSON.parse(Buffer.from(parts[1].split('\r\n\r\n')[1],'latin1').toString('utf8'));const pdf=parts[2].split('\r\n\r\n').slice(1).join('\r\n\r\n');return {meta,pdf};};
 const fetchImpl=async(input:any,init:any={})=>{
  const url=new URL(String(input));const method=init.method||'GET';const ok=(d:any)=>new Response(JSON.stringify(d),{status:200});
  if(url.host==='oauth2.googleapis.com'&&url.pathname==='/token')return ok({access_token:'tok',expires_in:3600});
  if(url.host==='oauth2.googleapis.com')return ok({});
  const id=decodeURIComponent(url.pathname.split('/files/')[1]||'');
  if(url.pathname==='/drive/v3/files'&&method==='GET'){
   const q=url.searchParams.get('q')!;const parent=q.match(/'([^']+)' in parents/)![1];const name=q.match(/name='([^']+)'/)![1];
   return ok({files:[...files.values()].filter(f=>!f.trashed&&f.parents.includes(parent)&&f.name===name&&f.mime.endsWith('folder')).map(f=>({id:f.id,name:f.name}))});
  }
  if(url.pathname==='/drive/v3/files'&&method==='POST'){const m=JSON.parse(init.body);const f={id:'F'+(++n),name:m.name,mime:m.mimeType,parents:m.parents,trashed:false};files.set(f.id,f);calls.push('folder:'+m.name);return ok({id:f.id});}
  if(url.pathname==='/upload/drive/v3/files'&&method==='POST'){const {meta,pdf}=parse(init.body,init.headers['Content-Type']);const f={id:'P'+(++n),name:meta.name,mime:'application/pdf',parents:meta.parents,trashed:false,bytes:pdf.length,content:pdf};files.set(f.id,f);calls.push('create:'+meta.name);return ok({id:f.id});}
  if(url.pathname.startsWith('/upload/drive/v3/files/')&&method==='PATCH'){
   const f=files.get(id);if(!f||f.trashed)return new Response(JSON.stringify({error:{message:'not found'}}),{status:404});
   const {meta,pdf}=parse(init.body,init.headers['Content-Type']);f.name=meta.name;f.content=pdf;f.bytes=pdf.length;
   const add=url.searchParams.get('addParents'),rem=url.searchParams.get('removeParents');if(add){f.parents=f.parents.filter(p=>p!==rem).concat(add);}
   calls.push('update:'+meta.name+(add?' (moved)':''));return ok({id:f.id});
  }
  if(url.pathname.startsWith('/drive/v3/files/')&&method==='PATCH'){const f=files.get(id);if(!f)return new Response('{}',{status:404});Object.assign(f,{trashed:JSON.parse(init.body).trashed});calls.push('trash:'+f.name);return ok({id});}
  return new Response('{}',{status:400});
 };
 const pathOf=(f:File)=>{const names:string[]=[];let p=files.get(f.parents[0]);while(p&&p.id!=='ROOT'){names.unshift(p.name);p=files.get(p.parents[0]);}return [...names,f.name].join(' / ');};
 return {files,calls,fetchImpl,pdfs:()=>[...files.values()].filter(f=>f.mime==='application/pdf'&&!f.trashed).map(pathOf).sort()};
}

/* ---------- a fake of the few database calls the sync makes ---------- */
function fakeDb(state:{conn:any;invoices:any[];payments:any[];files:any[]}){
 const table=(name:string):any[]=>name==='drive_connections'?[state.conn]:name==='invoices'?state.invoices:name==='payments'?state.payments:state.files;
 class Q{op='select';patch:any;filters:((r:any)=>boolean)[]=[];single=false;constructor(public t:string){}
  select(){if(this.op!=='update'&&this.op!=='delete')this.op=this.op==='select'?'select':this.op;return this;}
  update(p:any){this.op='update';this.patch=p;return this;}
  delete(){this.op='delete';return this;}
  upsert(row:any){const i=state.files.findIndex(f=>f.invoice_id===row.invoice_id);if(i>=0)state.files[i]={...state.files[i],...row};else state.files.push(row);return Promise.resolve({error:null});}
  eq(k:string,v:any){this.filters.push(r=>r[k]===v);return this;}
  not(k:string){this.filters.push(r=>r[k]!=null);return this;}
  or(){this.filters.push(r=>!r.sync_lease||Date.parse(r.sync_lease)<Date.now()-180000);return this;}
  order(){return this;}
  maybeSingle(){this.single=true;return this;}
  then(res:any,rej:any){try{const rows=table(this.t).filter(r=>this.filters.every(f=>f(r)));
   if(this.op==='update'){rows.forEach(r=>Object.assign(r,this.patch));}
   if(this.op==='delete'){for(const r of rows)state.files.splice(state.files.indexOf(r),1);}
   const data=this.single?(rows[0]??null):JSON.parse(JSON.stringify(rows));return Promise.resolve({data,error:null}).then(res,rej);}catch(e){return Promise.reject(e).then(res,rej);}}
 }
 return {from:(t:string)=>new Q(t)};
}

test('Drive file naming and folders',()=>{
 assert.deepEqual(monthFolder('2026-10-29'),{year:'2026',month:'10 October'});
 assert.equal(driveFileName({id:'1',number:'INV-00012',name:'Retainer — Oct/Nov'},'Northstar: Coffee'),'INV-00012 · Northstar- Coffee · Retainer — Oct-Nov.pdf');
 const inv={id:'1',number:'INV-1',name:'A',items:[{service:'x',quantity:1,rate:10,tax:0}]};
 assert.equal(contentHash(inv,undefined,0),contentHash({...inv},undefined,0));
 assert.notEqual(contentHash(inv,undefined,0),contentHash(inv,undefined,5),'a payment refreshes the PDF');
});

test('sync: uploads into Year → Month, skips unchanged, updates in place, moves, tidies deleted invoices',async t=>{
 const drive=fakeDrive();const real=globalThis.fetch;globalThis.fetch=drive.fetchImpl as any;t.after(()=>{globalThis.fetch=real;});
 const client={id:'c1',name:'Northstar Coffee'};
 const inv=(id:string,number:string,issue:string,rate=50000)=>({id,workspace_id:'w',number,name:'Monthly content',issue_date:issue,due_date:issue,status:'Draft',discount:0,client,items:[{service:'Content',description:'',quantity:1,rate,tax:18}]});
 const state:any={conn:{workspace_id:'w',refresh_token:'r',folder_id:'ROOT',sync_lease:null},invoices:[inv('i1','INV-00001','2026-09-29'),inv('i2','INV-00002','2026-10-29')],payments:[],files:[]};
 const db=fakeDb(state);
 let r=await syncWorkspaceInvoices('w',{db});
 assert.equal(r.uploaded,2);assert.equal(r.error,undefined);
 assert.deepEqual(drive.pdfs(),['2026 / 09 September / INV-00001 · Northstar Coffee · Monthly content.pdf','2026 / 10 October / INV-00002 · Northstar Coffee · Monthly content.pdf']);
 assert.ok([...drive.files.values()].every(f=>f.mime!=='application/pdf'||f.content!.startsWith('%PDF')),'real PDFs were uploaded');
 // nothing changed → nothing uploaded
 drive.calls.length=0;r=await syncWorkspaceInvoices('w',{db});assert.equal(r.uploaded,0);assert.equal(drive.calls.length,0);
 // a payment and an edit refresh the same file (no duplicate)
 state.payments.push({workspace_id:'w',invoice_id:'i1',amount:59000});state.invoices[1].items[0].rate=60000;
 r=await syncWorkspaceInvoices('w',{db});assert.equal(r.uploaded,2);assert.equal(drive.pdfs().length,2);assert.ok(drive.calls.every(c=>c.startsWith('update:')));
 // moving an invoice to another month moves its file
 state.invoices[1].issue_date='2026-11-29';drive.calls.length=0;
 await syncWorkspaceInvoices('w',{db});assert.ok(drive.calls.some(c=>c.includes('(moved)')));assert.ok(drive.pdfs()[1].startsWith('2026 / 11 November /'));
 // a deleted invoice's file goes to the Drive bin
 state.invoices.splice(0,1);r=await syncWorkspaceInvoices('w',{db});assert.equal(r.removed,1);assert.equal(drive.pdfs().length,1);
 // the lease stops two syncs running at once, and is released afterwards
 state.conn.sync_lease=new Date().toISOString();assert.equal((await syncWorkspaceInvoices('w',{db})).uploaded,0);state.conn.sync_lease=null;
 assert.equal(state.conn.sync_lease,null);
});

test('sync: big backlogs are worked through in batches; a revoked connection is reported',async t=>{
 const drive=fakeDrive();const real=globalThis.fetch;globalThis.fetch=drive.fetchImpl as any;t.after(()=>{globalThis.fetch=real;});
 const invoices=Array.from({length:7},(_,i)=>({id:'i'+i,workspace_id:'w',number:`INV-${i}`,name:'x',issue_date:'2026-10-01',items:[{service:'s',quantity:1,rate:1,tax:0}]}));
 const state:any={conn:{workspace_id:'w',refresh_token:'r',folder_id:'ROOT',sync_lease:null},invoices,payments:[],files:[]};
 const db=fakeDb(state);
 let r=await syncWorkspaceInvoices('w',{db,limit:3});assert.equal(r.error,undefined);assert.deepEqual([r.uploaded,r.remaining],[3,4]);
 r=await syncWorkspaceInvoices('w',{db,limit:3});assert.deepEqual([r.uploaded,r.remaining],[3,1]);
 r=await syncWorkspaceInvoices('w',{db,limit:3});assert.deepEqual([r.uploaded,r.remaining],[1,0]);
 globalThis.fetch=(async(u:any)=>String(u).includes('/token')?new Response(JSON.stringify({error:'invalid_grant'}),{status:400}):new Response('{}'))as any;
 state.invoices[0].name='changed';state.conn.refresh_token='revoked';
 r=await syncWorkspaceInvoices('w',{db});assert.match(r.error!,/reconnect/);assert.match(state.conn.last_error,/reconnect/);
});

test('database: Drive tables are server-only; managers see status without the token',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create schema auth; create role anon; create role authenticated; create role service_role;
   create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb not null default '{}');
   create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
   create function auth.jwt() returns jsonb language sql stable as $$ select '{"email":"a@b.co"}'::jsonb $$;
   grant usage on schema auth to authenticated; grant execute on all functions in schema auth to authenticated;`);
  await db.exec(readFileSync('supabase/migrations/001_grid.sql','utf8').replace('create extension if not exists pgcrypto;',''));
  await db.exec(readFileSync('supabase/migrations/009_google_drive.sql','utf8'));
  const a=crypto.randomUUID(),b=crypto.randomUUID();await db.query("insert into auth.users(id,email) values($1,'a@b.co'),($2,'x@y.co')",[a,b]);
  const as=async(id:string)=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');};
  await as(a);const w=Object.values((await db.query<any>("select bootstrap_workspace('Studio','Admin') w")).rows[0])[0];
  assert.deepEqual((await db.query<any>('select drive_status($1) s',[w])).rows[0].s,{connected:false});
  await db.exec('reset role');await db.query("insert into drive_connections(workspace_id,refresh_token,google_email,folder_id,folder_name) values($1,'SECRET','a@gmail.com','F1','GRID Invoices')",[w]);
  await as(a);const s=(await db.query<any>('select drive_status($1) s',[w])).rows[0].s;
  assert.equal(s.connected,true);assert.equal(s.folder_name,'GRID Invoices');assert.ok(!JSON.stringify(s).includes('SECRET'),'token never exposed');
  await assert.rejects(()=>db.query('select * from drive_connections'),/permission denied/);
  await as(b);assert.equal((await db.query<any>('select drive_status($1) s',[w])).rows[0].s,null,'non-members see nothing');
 }finally{await db.close();}
});
