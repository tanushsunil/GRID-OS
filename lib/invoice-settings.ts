/** Workspace-wide choices for what the invoice PDF shows under the line items. */
export type InvoiceSettings={gst:boolean;subtotal:boolean;paid:boolean;balance:boolean};
export const DEFAULT_INVOICE_SETTINGS:InvoiceSettings={gst:true,subtotal:true,paid:true,balance:true};
export const INVOICE_SETTING_LABELS:Record<keyof InvoiceSettings,[string,string]>={
 subtotal:['Subtotal','The amount before GST, with any discount shown underneath.'],
 gst:['GST','The GST amount, when an invoice has tax.'],
 paid:['Paid','How much has been received, once a payment is recorded.'],
 balance:['Balance due','What’s still owed, once a payment is recorded.'],
};
/** Fill in anything missing (older workspaces have no settings yet) with the defaults. */
export function invoiceSettings(raw:unknown):InvoiceSettings{
 const r=(raw&&typeof raw==='object'?raw:{}) as Record<string,unknown>;
 return Object.fromEntries(Object.entries(DEFAULT_INVOICE_SETTINGS).map(([k,v])=>[k,typeof r[k]==='boolean'?r[k]:v])) as InvoiceSettings;
}
