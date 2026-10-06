import test from 'node:test';
import assert from 'node:assert/strict';
import {invoiceState,invoiceStates,nextNumber,today} from '../lib/domain';
import {demoWorkspace,migrateDemo,loadDemo,saveDemo,DEMO_KEY} from '../lib/demo';
import {bigWorkspace} from './bench-fixture';

const memoryStorage=(seed:Record<string,string>={})=>{const m=new Map(Object.entries(seed));return {getItem:(k:string)=>m.get(k)??null,setItem:(k:string,v:string)=>{m.set(k,v);},keys:()=>[...m.keys()]};};

test('invoiceStates matches invoiceState for every invoice',()=>{const d=bigWorkspace(0.2).data;const states=invoiceStates(d,today());for(const i of d.invoices)assert.deepEqual(states.get(i.id),invoiceState(i,d.payments,today()));});

test('nextNumber never reuses a number after a deletion',()=>{assert.equal(nextNumber([],'INV'),'INV-00001');assert.equal(nextNumber([{id:'a',number:'INV-00001'},{id:'c',number:'INV-00003'}],'INV'),'INV-00004');assert.equal(nextNumber([{id:'a',number:'oops'},{id:'b'}],'EST'),'EST-00001');});

test('migrateDemo upgrades an old saved workspace without losing data',()=>{const old:any=demoWorkspace();delete old.data.rentals;delete old.extras;old.activity=[];const projects=old.data.projects.length;const s=migrateDemo(JSON.parse(JSON.stringify(old)));assert.equal(s.data.projects.length,projects);assert.ok(s.data.rentals.length>0,'sample rentals added');assert.ok(Array.isArray(s.extras.templates)&&s.extras.gearCatalog.length>0);assert.ok(s.activity.length>0);
 const kept=migrateDemo({...JSON.parse(JSON.stringify(s)),extras:{...s.extras,gearCatalog:[]}});assert.equal(kept.extras.gearCatalog.length,0,'an emptied gear list stays empty');
 const twice=migrateDemo(JSON.parse(JSON.stringify(s)));assert.equal(twice.data.rentals.length,s.data.rentals.length,'running twice changes nothing');});

test('migrateDemo repairs missing or broken collections',()=>{const s=migrateDemo({workspace:{id:'w',name:'W',timezone:'Asia/Kolkata'},user:{id:'u'},data:{projects:'not a list'}});assert.deepEqual(s.data.projects,[]);assert.ok(Array.isArray(s.data.tasks)&&Array.isArray(s.members));});

test('loadDemo sets corrupted data aside and starts fresh',()=>{const store=memoryStorage({[DEMO_KEY]:'{"broken":'});const {state,recovered}=loadDemo(store);assert.equal(recovered,true);assert.ok(state.workspace&&state.data.projects.length>0);assert.ok(store.keys().some(k=>k.startsWith(DEMO_KEY+'-corrupt-')),'corrupted copy kept');
 const ok=memoryStorage({[DEMO_KEY]:JSON.stringify(demoWorkspace())});assert.equal(loadDemo(ok).recovered,false);
 const blocked={getItem:()=>{throw Error('SecurityError');},setItem:()=>{}};assert.ok(loadDemo(blocked).state.workspace);});

test('saveDemo explains a full or blocked browser storage',()=>{assert.throws(()=>saveDemo({setItem:()=>{throw Error('QuotaExceededError');}},{}),/storage is full or blocked/);});

test('formatters survive bad input instead of crashing the page',async()=>{const {money,displayDate}=await import('../lib/domain');assert.equal(displayDate('not-a-date'),'No date');assert.equal(displayDate(undefined),'No date');assert.equal(displayDate('2026-10-06'),'6 Oct 2026');assert.equal(money('abc'),money(0));assert.equal(money(1234.5),'₹1,234.50');});
