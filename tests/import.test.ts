import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {parseCsv,toCsv} from '../lib/tabular';
import {autoMap,parseDate,parseNumber,planImport,exportTable,templateTable,columns,type ImportKind} from '../lib/import';
import {demoWorkspace,demoImport,migrateDemo} from '../lib/demo';
import {emptyData,invoiceState} from '../lib/domain';

const plan=(kind:ImportKind,csv:string,data=emptyData(),opts={})=>{const [h,...rows]=parseCsv(csv);return planImport(kind,rows,autoMap(kind,h),data,opts);};

test('CSV: quotes, commas, line breaks, BOM, semicolons; round-trips',()=>{
 assert.deepEqual(parseCsv('﻿Name,Notes\r\n"Doe, Jane","said ""hi""\nthen left"\r\n\r\n'),[['Name','Notes'],['Doe, Jane','said "hi"\nthen left']]);
 assert.deepEqual(parseCsv('a;b\n1;"x;y"'),[['a','b'],['1','x;y']]);
 assert.deepEqual(parseCsv('a\tb\n1\t2'),[['a','b'],['1','2']]);
 const out=toCsv(['A','B'],[['x,y',new Date(Date.UTC(2026,9,7))],[null,12]]);
 assert.ok(out.startsWith('﻿'));assert.deepEqual(parseCsv(out),[['A','B'],['x,y','2026-10-07'],['','12']]);
});

test('dates and numbers in the formats people actually use',()=>{
 for(const [v,want] of [['2026-10-07','2026-10-07'],['07/10/2026','2026-10-07'],['7-10-26','2026-10-07'],['07.10.2026','2026-10-07'],['7 Oct 2026','2026-10-07'],['07-Oct-26','2026-10-07'],['Oct 7, 2026','2026-10-07'],['7th October 2026','2026-10-07'],['25/12/2026','2026-12-25'],[46302,'2026-10-07']] as const)assert.equal(parseDate(v as any),want,String(v));
 assert.equal(parseDate('10/07/2026',true),'2026-10-07');assert.equal(parseDate('12/25/2026'),'2026-12-25');
 assert.equal(parseDate(new Date(Date.UTC(2026,9,7))),'2026-10-07');
 for(const bad of ['31/02/2026','soon','2026-13-01'])assert.equal(parseDate(bad),null,bad);
 assert.equal(parseNumber('₹1,25,000.50'),125000.5);assert.equal(parseNumber('Rs. 900'),900);assert.equal(parseNumber('18%'),18);assert.equal(parseNumber(''),null);assert.ok(Number.isNaN(parseNumber('abc')));
});

test('columns are matched by name and common aliases',()=>{
 const map=autoMap('clients',['Company Name','E-mail','GSTIN','Mobile','Something else']);
 assert.equal(map.name,0);assert.equal(map.email,1);assert.equal(map.tax_id,2);assert.equal(map.phone,3);assert.equal(map.contact,null);
});

test('clients and leads: duplicates skipped, bad rows explained, required column enforced',()=>{
 const data=emptyData();data.clients=[{id:'c1',name:'Northstar Coffee',email:'sam@northstar.example'}];
 const p=plan('clients','Client,Email,Phone\nNorthstar Coffee,,\nForma Living,nisha@forma.example,\nForma Living,,\nNew Co,not-an-email,\n,x@y.co,\nOther,SAM@northstar.example,',data);
 assert.equal(p.ready.length,1);assert.equal(p.ready[0].name,'Forma Living');
 assert.equal(p.skipped.length,3);assert.deepEqual(p.problems.map(x=>x.row),[5,6]);
 assert.match(plan('clients','Email\na@b.co').problems[0].message,/Client name/);
 const l=plan('leads','Name,Company,Status,Budget,Source\nPriya,Atelier,won,"₹1,20,000",referral\nRavi,,maybe,,\nAsha,,,abc,');
 assert.equal(l.ready.length,1);assert.equal(l.ready[0].status,'Won');assert.equal(l.ready[0].budget,120000);assert.equal(l.ready[0].source,'Referral');
 assert.equal(l.problems.length,2);
});

test('invoices: grouping by number, totals-only rows, payments, new clients and projects',()=>{
 const data=emptyData();data.clients=[{id:'c1',name:'Northstar Coffee'}];data.invoices=[{id:'i0',number:'TS-00100'}];
 const p=plan('invoices',[
  'Invoice number,Client,Issue date,Due date,Status,Service,Quantity,Rate,Tax %,Amount,Amount paid',
  'TS-00206,Northstar Coffee,01/10/2026,15/10/2026,Paid,Reels,3,15000,18,,',
  'TS-00206,Northstar Coffee,01/10/2026,15/10/2026,Paid,Editing,1,5000,18,,',
  'TS-00207,Forma Living,02/10/2026,,Partially Paid,,,,,"40,000",10000',
  'TS-00208,Forma Living,03/10/2026,,Unpaid,,,,,25000,',
  'TS-00100,Northstar Coffee,01/09/2026,,Paid,,,,,1000,',
  'TS-00209,Forma Living,05/10/2026,01/10/2026,,,,,,100,',
  'TS-00210,,05/10/2026,,,,,,,100,',
  'TS-00211,Forma Living,05/10/2026,,Draft,,,,,100,50',
 ].join('\n'),data);
 assert.equal(p.ready.length,3);assert.equal(p.skipped.length,1);
 assert.deepEqual(p.problems.map(x=>x.row),[7,8,9]);
 const [a,b,c]=p.ready;
 assert.equal(a.items.length,2);assert.equal(a.total,59000);assert.equal(a.amount_paid,59000);assert.equal(a.status,'Sent');assert.equal(a.payment_date,'2026-10-15');
 assert.equal(b.items.length,1);assert.equal(b.total,40000);assert.equal(b.amount_paid,10000);assert.equal(b.due_date,'2026-10-02');
 assert.equal(c.amount_paid,0);assert.equal(c.project,'Imported invoices');
 assert.deepEqual(p.newClients,['Forma Living']);assert.equal(p.newProjects.length,2);
});

test('export → import round trip keeps every invoice, total and payment',()=>{
 const state=migrateDemo(null);const src=state.data;
 for(const kind of ['clients','leads','invoices'] as ImportKind[]){
  const t=exportTable(kind,src);const csv=toCsv(t.headers,t.rows);
  const fresh=demoWorkspace();fresh.data=emptyData();
  const p=plan(kind,csv,fresh.data);
  assert.equal(p.problems.length,0,`${kind}: ${JSON.stringify(p.problems)}`);
  demoImport(fresh,p);
  assert.equal(fresh.data[kind].length,src[kind].length,kind);
  if(kind==='invoices')for(const inv of src.invoices){
   const copy=fresh.data.invoices.find((x:any)=>x.number===inv.number)!;const a=invoiceState(inv,src.payments),b=invoiceState(copy,fresh.data.payments);
   assert.equal(b.total,a.total);assert.equal(b.paid,a.paid);
  }
  // importing the same export again adds nothing
  assert.equal(plan(kind,csv,fresh.data).ready.length,0);
 }
});

test('templates parse cleanly with every column recognised',()=>{
 for(const kind of ['clients','leads','invoices'] as ImportKind[]){
  const t=templateTable(kind);const p=plan(kind,toCsv(t.headers,t.rows));
  assert.equal(p.problems.length,0,JSON.stringify(p.problems));assert.equal(p.ready.length,1);
  assert.ok(Object.values(autoMap(kind,t.headers)).every(v=>v!==null),`${kind} template headers all map`);
  assert.equal(t.headers.length,columns[kind].length);
 }
});

test('database: import_invoices creates clients, projects, items and payments in one go',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create schema auth; create role anon; create role authenticated; create role service_role;
   create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb not null default '{}');
   create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
   create function auth.jwt() returns jsonb language sql stable as $$ select '{"email":"a@b.co"}'::jsonb $$;
   grant usage on schema auth to authenticated; grant execute on all functions in schema auth to authenticated;`);
  for(const f of ['001_grid','002_project_cost','003_rentals','004_item_units','005_usernames','006_import'])await db.exec(readFileSync(`supabase/migrations/${f}.sql`,'utf8').replace('create extension if not exists pgcrypto;',''));
  const u=crypto.randomUUID();await db.query(`insert into auth.users(id,email) values($1,'a@b.co')`,[u]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[u]);await db.exec('set role authenticated');
  const w=(await db.query<any>("select bootstrap_workspace('Studio','Admin') w")).rows[0].w;
  const t=templateTable('invoices');const extra:Record<string,string>={number:'TS-00300',client:'Forma Living',issue_date:'03/10/2026',status:'Sent',amount:'25000'};const p=plan('invoices',toCsv(t.headers,[...t.rows,columns.invoices.map(c=>extra[c.key]??'')]));
  assert.equal(p.ready.length,2,JSON.stringify(p.problems));
  const res=(await db.query<any>('select import_invoices($1,$2::jsonb) r',[w,JSON.stringify(p.ready)])).rows[0].r;
  assert.deepEqual(res,{invoices:2,clients:2,projects:2});
  const rows=(await db.query<any>("select i.number,i.status,invoice_total(i.id) total,(select coalesce(sum(amount),0) from payments where invoice_id=i.id) paid from invoices i order by number")).rows;
  assert.deepEqual(rows.map(r=>[r.number,r.status,Number(r.total),Number(r.paid)]),[['TS-00206','Sent',53100,53100],['TS-00300','Sent',25000,0]]);
  // a duplicate number rolls back the whole batch
  await assert.rejects(()=>db.query('select import_invoices($1,$2::jsonb)',[w,JSON.stringify([{...p.ready[1],number:'TS-00999',client:'Brand New'},p.ready[0]])]));
  assert.equal(Number((await db.query<any>("select count(*) n from clients where name='Brand New'")).rows[0].n),0);
 }finally{await db.close();}
});

test('Excel: exported invoices open as real dates and numbers, and import back unchanged',async()=>{
 const {default:writeXlsxFile}=await import('write-excel-file/node');const {readSheet}=await import('read-excel-file/node');
 const {xlsxSheet}=await import('../lib/tabular');
 const state=migrateDemo(null);const t=exportTable('invoices',state.data);
 const {data,options}=xlsxSheet(t.headers,t.rows,'Invoices');
 const buffer=await (writeXlsxFile as any)(data,options).toBuffer();
 const grid=await readSheet(buffer) as any[][];
 const issueCol=t.headers.indexOf('Issue date');
 assert.ok(grid[1][issueCol] instanceof Date,'issue date is an Excel date');
 assert.equal(typeof grid[1][t.headers.indexOf('Rate')],'number');
 const fresh=demoWorkspace();fresh.data=emptyData();
 const p=planImport('invoices',grid.slice(1),autoMap('invoices',grid[0].map(String)),fresh.data);
 assert.equal(p.problems.length,0,JSON.stringify(p.problems));
 demoImport(fresh,p);
 assert.equal(invoiceState(fresh.data.invoices[0],fresh.data.payments).total,invoiceState(state.data.invoices[0],state.data.payments).total);
});
