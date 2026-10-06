// Synthetic "busy agency" workspace for performance checks (not a test).
import {demoWorkspace} from '../lib/demo';
import {today} from '../lib/domain';
export function bigWorkspace(scale=1){
 const s:any=demoWorkspace();const d=s.data;const uid=()=>crypto.randomUUID();const day=(n:number)=>{const x=new Date(today()+'T12:00:00Z');x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10);};
 const clients=Array.from({length:60*scale},(_,i)=>({id:uid(),name:`Client ${i}`,email:`c${i}@x.example`}));d.clients.push(...clients);
 for(let i=0;i<400*scale;i++){const c=clients[i%clients.length];const p={id:uid(),name:`Project ${i}`,client_id:c.id,status:['Planning','Editing','Completed','Delivered'][i%4],start_date:day(-i%300),deadline:day(30-i%300),cost:i%3?5000:null};d.projects.push(p);
  for(let t=0;t<8;t++)d.tasks.push({id:uid(),name:`Task ${i}.${t}`,project_id:p.id,status:['To Do','In Progress','Review','Done'][t%4],due_date:day(t-i%200),assignee_id:s.members[t%3].user_id,priority:'Medium'});
  for(let t=0;t<4;t++)d.deliverables.push({id:uid(),name:`Deliverable ${i}.${t}`,project_id:p.id,status:'In Progress',due_date:day(t-i%100),assignee_id:s.members[t%3].user_id});
  const sh={id:uid(),name:`Shoot ${i}`,project_id:p.id,date:day(i%60-30),start_time:'09:00',status:'Planned'};d.shoots.push(sh);
  for(let r=0;r<3;r++)d.rentals.push({id:uid(),name:`Gear ${r}`,category:['Camera','Lighting','Grip'][r],project_id:p.id,shoot_id:sh.id,rate:2000,quantity:1,days:1,start_date:sh.date,status:'Booked'});
  const inv={id:uid(),number:`INV-${i}`,name:p.name,client_id:c.id,project_id:p.id,issue_date:day(-i%360),due_date:day(14-i%360),status:'Sent',discount:0,items:[{service:'Work',description:'',quantity:1,rate:50000,tax:18}]};d.invoices.push(inv);
  for(let k=0;k<3;k++)d.payments.push({id:uid(),invoice_id:inv.id,amount:10000,date:day(-i%300+k),method:'UPI'});
 }
 return s;
}
