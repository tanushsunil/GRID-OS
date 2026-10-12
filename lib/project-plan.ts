import type {ProjectTemplate} from './extras';

/** The project builder's plan: how many of each deliverable, and when each item happens (days from the start).
 *  Pure functions so the scheduling rules are testable. */
export type Lane='shoot'|'deliverable'|'task';
export type Kind={id:string;label:string;singular:string;lane:Lane;type:string;builtIn?:boolean};
/** day: first day (from the project start); length: days it runs — its due date is day+length-1.
 *  Shoots are single days with a call and wrap time. */
export type PlanItem={id:string;kind:string;lane:Lane;name:string;type:string;day:number;length:number;start_time?:string;end_time?:string;assignee_id?:string|null};
export const dueDay=(i:Pick<PlanItem,'day'|'length'>)=>i.day+Math.max(1,i.length)-1;
/** How long each kind usually takes, ending on its due date. */
export const DEFAULT_LENGTH:Record<string,number>={shoot:1,reel:3,photos:2,film:7,post:2,story:1,task:1};

export const BUILT_IN_KINDS:Kind[]=[
 {id:'shoot',label:'Shoot days',singular:'Shoot day',lane:'shoot',type:'Shoot',builtIn:true},
 {id:'reel',label:'Reels',singular:'Reel',lane:'deliverable',type:'Reel',builtIn:true},
 {id:'photos',label:'Photo sets',singular:'Photo set',lane:'deliverable',type:'Photography',builtIn:true},
 {id:'film',label:'Films',singular:'Film',lane:'deliverable',type:'Film',builtIn:true},
 {id:'post',label:'Posts / carousels',singular:'Post',lane:'deliverable',type:'Design',builtIn:true},
 {id:'story',label:'Story sets',singular:'Story set',lane:'deliverable',type:'Other',builtIn:true},
];
const uid=()=>Math.random().toString(36).slice(2,10);
/** Days after a shoot that each kind of deliverable is usually due, and the gap between several of them. */
const TURNAROUND:Record<string,[number,number]>={reel:[5,2],photos:[4,3],film:[14,7],post:[3,2],story:[2,1]};

/** First-draft due day: shoots a week apart from day 7; each deliverable due a typical turnaround after its shoot. */
export function autoDay(kind:Kind,index:number,items:PlanItem[]){
 if(kind.lane==='shoot')return 7+index*7;
 const shoots=items.filter(i=>i.lane==='shoot').map(i=>i.day).sort((a,b)=>a-b);
 const [after,gap]=TURNAROUND[kind.id]??[6,2];
 // shared out across the shoots in turn: with 2 shoots, reels 1 and 3 follow shoot 1, reels 2 and 4 follow shoot 2
 const n=shoots.length;const base=n?shoots[index%n]:3;const k=n?Math.floor(index/n):index;
 return Math.max(1,base+after+k*gap);
}

/** Make the plan match the counters: keep existing items (and their days), add new ones scheduled after the others,
 *  and remove the last ones when a count goes down. */
export function syncPlan(items:PlanItem[],counts:Record<string,number>,kinds:Kind[]):PlanItem[]{
 let next=[...items];
 for(const kind of kinds){
  const mine=next.filter(i=>i.kind===kind.id);const want=Math.max(0,counts[kind.id]||0);
  if(mine.length>want){const drop=new Set(mine.slice(want).map(i=>i.id));next=next.filter(i=>!drop.has(i.id));}
  for(let n=mine.length;n<want;n++){const length=DEFAULT_LENGTH[kind.id]??2;const due=autoDay(kind,n,next);
   next.push({id:uid(),kind:kind.id,lane:kind.lane,type:kind.type,name:want===1&&n===0&&kind.lane!=='shoot'?kind.singular:`${kind.singular} ${n+1}`,day:Math.max(0,due-length+1),length,...(kind.lane==='shoot'?{start_time:'09:00',end_time:'17:00'}:{})});}
 }
 // numbered names follow the count ("Reel" becomes "Reel 1" once there are two)
 for(const kind of kinds){const mine=next.filter(i=>i.kind===kind.id);mine.forEach((i,n)=>{const auto=new RegExp(`^${kind.singular.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}( \\d+)?$`);if(auto.test(i.name))i.name=mine.length===1&&kind.lane!=='shoot'?kind.singular:`${kind.singular} ${n+1}`;});}
 return next;
}

/** Standard tasks for a fresh plan: planning before the first shoot, review before the last delivery. */
export function defaultTasks(items:PlanItem[]):PlanItem[]{
 const firstShoot=Math.min(...items.filter(i=>i.lane==='shoot').map(i=>i.day),99);
 const lastDelivery=Math.max(...items.filter(i=>i.lane==='deliverable').map(dueDay),0);
 const task=(name:string,day:number,length=1):PlanItem=>({id:uid(),kind:'task',lane:'task',type:'Task',name,day,length});
 const tasks:PlanItem[]=[task('Concepts & planning',1,2)];
 if(firstShoot<99)tasks.push(task('Shot list & call sheet',Math.max(2,firstShoot-2)));
 if(lastDelivery>0)tasks.push(task('Client review',Math.max(2,lastDelivery-2)));
 return tasks;
}

/** Counters and plan from a saved template (deliverable names/types mapped back onto the counters). */
export function planFromTemplate(t:ProjectTemplate,kinds:Kind[]=BUILT_IN_KINDS){
 const kindFor=(type?:string,name?:string)=>{const n=(name||'').toLowerCase();if(/story/.test(n))return 'story';if(/post|carousel/.test(n))return 'post';return ({Reel:'reel',Photography:'photos',Film:'film',Design:'post',Other:'story'} as Record<string,string>)[type||'']??'reel';};
 const items:PlanItem[]=[
  ...t.shoots.map(s=>({id:uid(),kind:'shoot',lane:'shoot' as Lane,type:'Shoot',name:s.name,day:s.offset,length:1,start_time:s.start_time,end_time:s.end_time})),
  ...t.deliverables.map(d=>{const k=kindFor(d.type,d.name);return {id:uid(),kind:k,lane:'deliverable' as Lane,type:kinds.find(x=>x.id===k)?.type||d.type||'Other',name:d.name,day:d.offset,length:d.length||1};}),
  ...t.tasks.map(x=>({id:uid(),kind:'task',lane:'task' as Lane,type:'Task',name:x.name,day:x.offset,length:x.length||1})),
 ];
 const counts:Record<string,number>={};for(const i of items)if(i.lane!=='task')counts[i.kind]=(counts[i.kind]||0)+1;
 return {items,counts};
}

/** The plan as a template the existing project creation understands (and that can be saved for reuse). */
export function planToTemplate(items:PlanItem[],meta:{name:string;project_type:string;brief:string}):ProjectTemplate{
 const sorted=[...items].sort((a,b)=>a.day-b.day);
 return {id:'tpl-'+uid(),name:meta.name,project_type:meta.project_type,brief:meta.brief,duration:Math.max(1,...items.map(dueDay)),
  shoots:sorted.filter(i=>i.lane==='shoot').map(i=>({name:i.name,offset:i.day,start_time:i.start_time||'09:00',end_time:i.end_time||'17:00'})),
  deliverables:sorted.filter(i=>i.lane==='deliverable').map(i=>({name:i.name,type:i.type,offset:i.day,length:Math.max(1,i.length),...(i.assignee_id!==undefined?{assignee_id:i.assignee_id}:{})})),
  tasks:sorted.filter(i=>i.lane==='task').map(i=>({name:i.name,priority:'Medium',offset:i.day,length:Math.max(1,i.length),...(i.assignee_id!==undefined?{assignee_id:i.assignee_id}:{})}))};
}
/** A plan saved for reuse doesn't keep who was assigned — templates are used with different teams. */
export function withoutAssignees(t:ProjectTemplate):ProjectTemplate{
 const strip=<T extends {assignee_id?:string|null}>(x:T)=>{const {assignee_id:_,...rest}=x;return rest as T;};
 return {...t,deliverables:t.deliverables.map(strip),tasks:t.tasks.map(strip)};
}

/** Lay items out in rows so cards never overlap. Each card takes its length, or at least `minSpan` days
 *  (short cards show their name beside the bar, which needs room). */
export function stackRows(items:PlanItem[],minSpan=3){
 const rows:number[]=[];const out=new Map<string,number>();
 for(const i of [...items].sort((a,b)=>a.day-b.day||a.name.localeCompare(b.name))){
  let r=rows.findIndex(end=>end<i.day);if(r<0){r=rows.length;rows.push(0);}
  rows[r]=i.day+Math.max(minSpan,i.length||1)-1;out.set(i.id,r);
 }
 return {rowOf:out,rows:Math.max(1,rows.length)};
}

/* ---------- From an estimate ---------- */
/** One estimate line and what it becomes in the project: a built-in kind, its own deliverable type ('custom'),
 *  or nothing ('none' — e.g. editing hours, travel, fees). */
export type EstimateLine={index:number;service:string;quantity:number;unit:string;kind:string;count:number};
/** Best guess from the line's wording (service, description, unit). */
export function guessKind(item:{service?:string;description?:string;unit?:string}):string{
 const unit=(item.unit||'').toLowerCase();const text=`${item.service||''} ${item.description||''} ${unit}`.toLowerCase();
 if(/\b(hours?|hrs?|minutes?|mins?)\b/.test(unit)||/\b(travel|transport|fee|licen[cs]e|equipment|rental|hire|permit|insurance|retainer|discount|advance)\b/.test(text))return 'none';
 if(/\b(reels?|shorts?|tiktoks?|vertical videos?)\b/.test(text))return 'reel';
 if(/\b(stor(y|ies))\b/.test(text))return 'story';
 if(/\b(posts?|carousels?|statics?|creatives?|graphics?|banners?|designs?)\b/.test(text))return 'post';
 if(/\b(sessions?|days?|shoots?|shooting)\b/.test(unit)||/\bshoot(ing)? days?\b|\bshoots?\b/.test(text))return 'shoot';
 if(/\b(photos?|photographs?|stills?|images?|pictures?|photography)\b/.test(text))return 'photos';
 if(/\b(films?|videos?|commercials?|tvc|documentar(y|ies)|ads?|cut ?downs?|edits?|videography)\b/.test(text))return 'film';
 return 'custom';
}
/** Each estimate line with a first guess and a count (its quantity, as a whole number of items). */
export function estimateLines(items:{service?:string;description?:string;quantity?:number|string;unit?:string}[]):EstimateLine[]{
 return items.map((it,index)=>{const kind=guessKind(it);const q=Number(it.quantity)||1;
  return {index,service:String(it.service||'Item').trim()||'Item',quantity:q,unit:String(it.unit||''),kind,count:kind==='none'?0:Math.max(1,Math.min(30,Math.round(q)))};});
}
/** A line that becomes its own deliverable type gets a kind named after its service. */
export const lineKind=(l:EstimateLine):Kind=>({id:`est-${l.index}`,label:l.service,singular:l.service,lane:'deliverable',type:'Other'});
/** Counters from the lines (several lines can add to the same kind). */
export function countsFromLines(lines:EstimateLine[]){
 const counts:Record<string,number>={};
 for(const l of lines){if(l.kind==='none')continue;const id=l.kind==='custom'?`est-${l.index}`:l.kind;counts[id]=(counts[id]||0)+l.count;}
 return counts;
}
