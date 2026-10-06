import test from 'node:test';
import assert from 'node:assert/strict';
import {requestJson,RequestError} from '../lib/http';
import {rateLimit,resetRateLimits,readJson,BodyError} from '../lib/api';
import {loadDemo,saveDemo,migrateDemo,backupFile,readBackup,demoAction,demoWorkspace,MAX_ACTIVITY,DEMO_KEY} from '../lib/demo';

const realFetch=globalThis.fetch;
const respond=(body:string,status=200)=>async()=>new Response(body,{status});
test('requests: JSON, readable errors, HTML error pages, timeouts and retries',async t=>{
 t.after(()=>{globalThis.fetch=realFetch;});
 globalThis.fetch=respond('{"ok":true}') as any;assert.deepEqual(await requestJson('/x'),{ok:true});
 globalThis.fetch=respond('{"error":"Nope"}',400) as any;await assert.rejects(requestJson('/x',{body:{}}),(e:any)=>e instanceof RequestError&&e.message==='Nope'&&e.status===400);
 globalThis.fetch=respond('<html>502 Bad Gateway</html>',502) as any;await assert.rejects(requestJson('/x',{body:{}}),/server ran into a problem/);
 globalThis.fetch=respond('<html>ok</html>') as any;await assert.rejects(requestJson('/x'),/unexpected response/);
 globalThis.fetch=respond('',429) as any;await assert.rejects(requestJson('/x',{body:{}}),/Too many attempts/);
 globalThis.fetch=((_:string,init:RequestInit)=>new Promise((_r,reject)=>init.signal!.addEventListener('abort',()=>reject(Object.assign(Error('aborted'),{name:'AbortError'}))))) as any;
 await assert.rejects(requestJson('/x',{timeout:20,retries:0}),/took too long/);
 // reads retry once after a dropped connection; writes never repeat
 let calls=0;globalThis.fetch=(async()=>{calls++;if(calls===1)throw TypeError('network');return new Response('{"n":1}');}) as any;
 assert.deepEqual(await requestJson('/x'),{n:1});assert.equal(calls,2);
 calls=0;await assert.rejects(requestJson('/x',{body:{}}),/Could not reach/);assert.equal(calls,1);
});

test('rate limiter: blocks past the limit, resets after the window',()=>{
 resetRateLimits();const t0=1_000_000;
 for(let i=0;i<3;i++)assert.ok(rateLimit('k',3,1000,t0).ok);
 const blocked=rateLimit('k',3,1000,t0+10);assert.ok(!blocked.ok);assert.ok(blocked.retryAfter>=1);
 assert.ok(rateLimit('other',3,1000,t0).ok);
 assert.ok(rateLimit('k',3,1000,t0+1001).ok);
});

test('request bodies: size cap and malformed JSON',async()=>{
 const req=(body:string,headers:Record<string,string>={})=>new Request('http://x/api',{method:'POST',body,headers});
 assert.deepEqual(await readJson(req('{"a":1}')),{a:1});
 await assert.rejects(readJson(req('x'.repeat(2000)),1000),(e:any)=>e instanceof BodyError&&e.status===413);
 await assert.rejects(readJson(req('{"a":1}',{'content-length':'999999'}),1000),(e:any)=>e.status===413);
 await assert.rejects(readJson(req('not json')),/could not be read/);
 await assert.rejects(readJson(req('"just a string"')),/could not be read/);
});

class MemoryStorage{
 map=new Map<string,string>();quota=Infinity;
 get length(){return this.map.size;}
 key(i:number){return [...this.map.keys()][i]??null;}
 getItem(k:string){return this.map.get(k)??null;}
 setItem(k:string,v:string){const used=[...this.map].reduce((n,[key,val])=>key===k?n:n+val.length,0);if(used+v.length>this.quota)throw Error('QuotaExceededError');this.map.set(k,v);}
 removeItem(k:string){this.map.delete(k);}
}
test('demo storage: trims history, cleans bad rows, keeps few corrupt copies, frees space',()=>{
 const s=new MemoryStorage();const state=demoWorkspace();
 state.activity=Array.from({length:MAX_ACTIVITY+50},(_,i)=>({id:String(i)}));
 (state.data.projects as any[]).push(null,{name:'no id'});
 const fixed=migrateDemo(structuredClone(state));
 assert.equal(fixed.activity.length,MAX_ACTIVITY);assert.ok(fixed.data.projects.every((p:any)=>p&&typeof p.id==='string'));
 for(let i=0;i<6;i++){s.setItem(DEMO_KEY,'{broken'+i);loadDemo(s as any);}
 assert.equal([...s.map.keys()].filter(k=>k.includes('-corrupt-')).length,3);
 // when storage is full, set-aside copies are cleared to make room before giving up
 const full=new MemoryStorage();full.setItem(DEMO_KEY+'-corrupt-1','x'.repeat(5000));full.quota=JSON.stringify(fixed).length+100;
 saveDemo(full as any,fixed);assert.ok(full.getItem(DEMO_KEY));assert.equal(full.getItem(DEMO_KEY+'-corrupt-1'),null);
 const tiny=new MemoryStorage();tiny.quota=10;assert.throws(()=>saveDemo(tiny as any,fixed),/Download a backup/);
});

test('demo backups round-trip and reject other files; actions fail clearly',()=>{
 const state=migrateDemo(null);const restored=readBackup(backupFile(state));
 assert.equal(restored.workspace.id,state.workspace.id);assert.equal(restored.data.projects.length,state.data.projects.length);
 assert.throws(()=>readBackup('not json'),/isn’t a GRID OS backup/);
 assert.throws(()=>readBackup('{"hello":1}'),/isn’t a GRID OS backup/);
 assert.throws(()=>demoAction(state,{action:'convert_lead',id:'missing'}),/no longer exists/);
 assert.throws(()=>demoAction(state,{action:'invoice_status',id:'missing',status:'Sent'}),/no longer exists/);
 assert.throws(()=>demoAction(state,{action:'workspace',data:{name:'  '}}),/workspace name/);
});
