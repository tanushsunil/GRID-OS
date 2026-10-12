import {buildDocumentPdf,pdfFileName,DEFAULT_TERMS} from '@/lib/document-pdf';
import {loadPdfFonts} from '@/lib/pdf-fonts';
import {itemSchema} from '@/lib/validation';
import {reply,readJson,rateLimit,clientIp,tooMany,failure} from '@/lib/api';
import {z} from 'zod';

/** Builds an invoice or estimate PDF from the document shown on screen. Fonts stay on the server. */
const text=(n:number)=>z.string().max(n).nullish();
const body=z.object({
 kind:z.enum(['invoice','estimate']),
 doc:z.object({number:text(60),name:text(500),issue_date:text(20),valid_until:text(20),discount:z.coerce.number().min(0).max(1e9).nullish(),items:z.array(itemSchema).max(200).default([]),payment_terms:text(20000),terms:text(20000),notes:text(20000)}).passthrough(),
 client:z.object({name:text(500),phone:text(100),billing_address:text(2000),tax_id:text(100)}).passthrough().nullish(),
 paid:z.coerce.number().min(0).max(1e9).default(0),
});
export async function POST(request:Request){
 try{
  const limited=rateLimit('pdf:'+clientIp(request),40,60_000);if(!limited.ok)return tooMany(limited.retryAfter);
  const b=body.parse(await readJson(request,512*1024));
  const doc=b.doc as any;
  const bytes=await buildDocumentPdf({kind:b.kind,doc,client:(b.client??undefined) as any,paid:b.paid,terms:[...DEFAULT_TERMS,doc.payment_terms,doc.terms,doc.notes].filter((t):t is string=>!!t&&!!String(t).trim()),fonts:await loadPdfFonts()});
  return new Response(Buffer.from(bytes),{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="${pdfFileName(doc)}"`,'Cache-Control':'no-store'}});
 }catch(err){return failure(err,{invalid:'This document has details the PDF can’t use. Check its items and dates.',fallback:'Couldn’t create the PDF right now. Please try again.'});}
}
