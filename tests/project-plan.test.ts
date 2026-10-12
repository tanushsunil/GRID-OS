import test from 'node:test';
import assert from 'node:assert/strict';
import {BUILT_IN_KINDS,syncPlan,autoDay,planFromTemplate,planToTemplate,stackRows,defaultTasks,type PlanItem} from '../lib/project-plan';
import {defaultTemplates} from '../lib/extras';

const k=(id:string)=>BUILT_IN_KINDS.find(x=>x.id===id)!;

test('counters add and remove items, keep dragged days, and number names',()=>{
 let items=syncPlan([],{shoot:1,reel:1},BUILT_IN_KINDS);
 assert.deepEqual(items.map(i=>[i.name,i.day]),[['Shoot day 1',7],['Reel',12]]);
 items=syncPlan(items,{shoot:1,reel:3},BUILT_IN_KINDS);
 assert.deepEqual(items.filter(i=>i.kind==='reel').map(i=>i.name),['Reel 1','Reel 2','Reel 3'],'"Reel" becomes "Reel 1" once there are more');
 // a dragged card keeps its day when other counts change
 items=items.map(i=>i.name==='Reel 2'?{...i,day:20}:i);
 items=syncPlan(items,{shoot:1,reel:3,photos:1},BUILT_IN_KINDS);
 assert.equal(items.find(i=>i.name==='Reel 2')!.day,20);
 // going down removes the last ones
 items=syncPlan(items,{shoot:1,reel:1,photos:1},BUILT_IN_KINDS);
 assert.deepEqual(items.filter(i=>i.kind==='reel').map(i=>i.name),['Reel']);
 // a renamed item keeps its own name
 items=items.map(i=>i.kind==='photos'?{...i,name:'Hero stills'}:i);items=syncPlan(items,{shoot:1,reel:1,photos:2},BUILT_IN_KINDS);
 assert.deepEqual(items.filter(i=>i.kind==='photos').map(i=>i.name),['Hero stills','Photo set 2']);
});

test('first-draft schedule: shoots a week apart, deliverables after their shoot',()=>{
 const shoots:PlanItem[]=[{id:'a',kind:'shoot',lane:'shoot',type:'Shoot',name:'S1',day:7},{id:'b',kind:'shoot',lane:'shoot',type:'Shoot',name:'S2',day:14}];
 assert.equal(autoDay(k('shoot'),0,[]),7);assert.equal(autoDay(k('shoot'),2,[]),21);
 assert.deepEqual([0,1,2,3].map(i=>autoDay(k('reel'),i,shoots)),[12,19,14,21],'reels alternate between the two shoots');
 assert.equal(autoDay(k('film'),0,shoots),21);assert.equal(autoDay(k('photos'),0,[]),7,'no shoot: counted from day 3');
 const tasks=defaultTasks([...shoots,{id:'r',kind:'reel',lane:'deliverable',type:'Reel',name:'Reel',day:19}]);
 assert.deepEqual(tasks.map(t=>[t.name,t.day]),[['Concepts & planning',1],['Shot list & call sheet',5],['Client review',17]]);
});

test('templates load into counters and plans save back as templates',()=>{
 const t=defaultTemplates[0];const {items,counts}=planFromTemplate(t);
 assert.equal(counts.shoot,t.shoots.length);assert.equal(counts.reel,3);assert.equal(counts.photos,1);
 assert.equal(items.filter(i=>i.lane==='task').length,t.tasks.length);
 const back=planToTemplate(items,{name:'Copy',project_type:t.project_type,brief:t.brief});
 assert.deepEqual(back.shoots.map(s=>[s.name,s.offset]),t.shoots.map(s=>[s.name,s.offset]));
 assert.deepEqual(back.deliverables.map(d=>[d.name,d.type,d.offset]).sort(),t.deliverables.map(d=>[d.name,d.type,d.offset]).sort());
 assert.equal(back.duration,Math.max(...items.map(i=>i.day)),'the deadline is the last item');
});

test('cards on nearby days stack into rows without overlapping',()=>{
 const at=(id:string,day:number):PlanItem=>({id,kind:'reel',lane:'deliverable',type:'Reel',name:id,day});
 const {rowOf,rows}=stackRows([at('a',10),at('b',11),at('c',12),at('d',13),at('e',20)],3);
 assert.equal(rows,3);assert.equal(rowOf.get('a'),0);assert.equal(rowOf.get('b'),1);assert.equal(rowOf.get('c'),2);assert.equal(rowOf.get('d'),0,'day 13 is free again in row 0');assert.equal(rowOf.get('e'),0);
});
