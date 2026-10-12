'use client';
import {useState} from 'react';
import {invoiceSettings,INVOICE_SETTING_LABELS,type InvoiceSettings} from '@/lib/invoice-settings';

/** Settings → "Invoice settings": switch lines under the invoice total on or off (applies to every PDF). */
export default function InvoiceSettingsForm({value,canEdit,onSave}:{value:unknown;canEdit:boolean;onSave:(s:InvoiceSettings)=>Promise<void>}){
 const [settings,setSettings]=useState(()=>invoiceSettings(value));const [saving,setSaving]=useState<string|null>(null);
 const toggle=async(k:keyof InvoiceSettings)=>{
  const next={...settings,[k]:!settings[k]};setSettings(next);setSaving(k);
  try{await onSave(next);}catch{setSettings(settings);}finally{setSaving(null);}
 };
 return <div className="settings-form">
  <p className="muted">Choose what appears under the line items on invoice PDFs — downloads and the copies saved to Google Drive. The total is always shown.</p>
  <div className="toggle-list">
   {(Object.keys(INVOICE_SETTING_LABELS) as (keyof InvoiceSettings)[]).map(k=><label key={k} className="toggle-row">
    <span><strong>{INVOICE_SETTING_LABELS[k][0]}</strong><small>{INVOICE_SETTING_LABELS[k][1]}</small></span>
    <input type="checkbox" role="switch" className="toggle" checked={settings[k]} disabled={!canEdit||saving!==null} aria-label={`Show ${INVOICE_SETTING_LABELS[k][0]} on invoices`} onChange={()=>toggle(k)}/>
   </label>)}
  </div>
  {!canEdit&&<p className="muted">Only workspace admins can change these.</p>}
 </div>;
}
