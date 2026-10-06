'use client';
import {useEffect,useRef,useState} from 'react';
import {X,Plus,Trash2,ArrowRight,Bookmark} from 'lucide-react';
import {fields} from '@/lib/domain';
import type {GearPreset} from '@/lib/extras';

const categories=fields.rentals.find(f=>f.key==='category')?.options||[];
const blank=():GearPreset=>({id:'gear-'+crypto.randomUUID(),name:'',category:'Camera',vendor:'',rate:0,quantity:1});

export default function GearCatalog({catalog,onSave,onRent,onClose}:{catalog:GearPreset[];onSave:(c:GearPreset[])=>void;onRent:(p:GearPreset)=>void;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null);const [rows,setRows]=useState<GearPreset[]>(()=>catalog.length?catalog.map(r=>({...r})):[blank()]);const [error,setError]=useState('');
 useEffect(()=>{dialog.current?.showModal();},[]);
 const set=(id:string,patch:Partial<GearPreset>)=>setRows(rs=>rs.map(r=>r.id===id?{...r,...patch}:r));
 const clean=()=>rows.filter(r=>r.name.trim()||r.rate).map(r=>({...r,name:r.name.trim(),vendor:r.vendor?.trim()||undefined,rate:Number(r.rate)||0,quantity:Number(r.quantity)||1}));
 const validate=(list:GearPreset[])=>{if(list.some(r=>!r.name))return 'Every saved item needs a name.';if(list.some(r=>r.rate<0||r.quantity<=0))return 'Rates must be zero or more and quantities above zero.';const names=list.map(r=>r.name.toLowerCase());if(new Set(names).size!==names.length)return 'Each saved item needs a unique name.';return '';};
 const save=()=>{const list=clean();const problem=validate(list);if(problem){setError(problem);return false;}onSave(list);return true;};
 return <dialog ref={dialog} className="modal wide gear-catalog" onCancel={e=>{e.preventDefault();onClose();}}>
  <div className="modal-head"><div><span className="eyebrow">RENTALS</span><h2>Saved gear</h2></div><button className="icon-button" aria-label="Close" onClick={onClose}><X size={20}/></button></div>
  <div className="modal-content">
   <p className="muted gear-intro"><Bookmark size={14}/>Items you rent often. Pick them when adding a rental and the vendor, rate and quantity fill in for you.</p>
   <div className="gear-table" role="table" aria-label="Saved gear">
    <div className="gear-row gear-head" role="row"><span role="columnheader">Item</span><span role="columnheader">Category</span><span role="columnheader">Vendor</span><span role="columnheader">Daily rate (₹)</span><span role="columnheader">Qty</span><span/></div>
    {rows.map(r=><div className="gear-row" role="row" key={r.id}>
     <input aria-label="Item name" placeholder="e.g. Sony FX3 cinema kit" value={r.name} onChange={e=>set(r.id,{name:e.target.value})}/>
     <select aria-label="Category" value={r.category||''} onChange={e=>set(r.id,{category:e.target.value})}>{categories.map(c=><option key={c}>{c}</option>)}</select>
     <input aria-label="Vendor" placeholder="Vendor" value={r.vendor||''} onChange={e=>set(r.id,{vendor:e.target.value})}/>
     <input aria-label="Daily rate" type="number" min={0} step="0.01" value={r.rate} onChange={e=>set(r.id,{rate:e.target.value as any})}/>
     <input aria-label="Quantity" type="number" min={1} step="1" value={r.quantity} onChange={e=>set(r.id,{quantity:e.target.value as any})}/>
     <span className="gear-actions">
      <button type="button" className="button small" disabled={!r.name.trim()} title="Rent this item" onClick={()=>{if(save())onRent({...r,name:r.name.trim(),rate:Number(r.rate)||0,quantity:Number(r.quantity)||1});}}>Rent<ArrowRight size={13}/></button>
      <button type="button" className="icon-button" aria-label={`Remove ${r.name||'item'}`} onClick={()=>setRows(rs=>rs.filter(x=>x.id!==r.id))}><Trash2 size={15}/></button>
     </span>
    </div>)}
   </div>
   <button type="button" className="button small gear-add" onClick={()=>setRows(rs=>[...rs,blank()])}><Plus size={14}/>Add item</button>
   {error&&<p className="notice error" role="alert">{error}</p>}
  </div>
  <div className="modal-footer"><button className="button" onClick={onClose}>Cancel</button><button className="button primary" onClick={()=>{if(save())onClose();}}>Save gear list</button></div>
 </dialog>;
}
