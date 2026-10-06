import {PDFDocument,rgb,type PDFFont,type PDFPage,type RGB} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import {totals,type Row,type Item} from './domain';
import {LOGO} from '@/components/logo';

/*
 * GRID media invoice / estimate PDF.
 * Layout measured from the studio's own Figma invoices (TS-00206 … TS-00211): A4, positions in points,
 * y values are distances from the top of the page to the text baseline.
 */
export const BRAND={word:'GRID',sub:'media'};
export const DEFAULT_TERMS=['More than 3 revisions will be charged.','Payment should be done within a week from the invoice’s issue.'];

export type PdfFonts={regular:ArrayBuffer|Uint8Array;bold:ArrayBuffer|Uint8Array;italic:ArrayBuffer|Uint8Array;lightItalic:ArrayBuffer|Uint8Array;display:ArrayBuffer|Uint8Array};
/** Font files served from /public, pre-trimmed to Latin + ₹ (Inter, SIL Open Font License). */
export const PDF_FONT_FILES:Record<keyof PdfFonts,string>={regular:'/fonts/inter/Inter-Regular.ttf',bold:'/fonts/inter/Inter-Bold.ttf',italic:'/fonts/inter/Inter-Italic.ttf',lightItalic:'/fonts/inter/Inter-LightItalic.ttf',display:'/fonts/inter/Inter-ExtraBold-Caps.ttf'};
export type DocumentPdfInput={kind:'invoice'|'estimate';doc:Row;client?:Row;paid?:number;terms?:string[];fonts:PdfFonts};

const W=595.28,H=841.89;
const INK=rgb(0.133,0.133,0.133),ORANGE=rgb(0.969,0.576,0.227),BROWN=rgb(0.29,0.247,0.212),RULE=rgb(0.896,0.896,0.896),WATERMARK=rgb(0.957,0.957,0.957);
const hex=(h:string)=>{const n=parseInt(h.replace('#',''),16);return rgb((n>>16&255)/255,(n>>8&255)/255,(n&255)/255);};
const COL={left:43.45,rate:297.7,qty:398.6,amount:548.5,right:551.5};

/** ₹ with Indian digit grouping; decimals only when the amount has paise. */
export const pdfMoney=(n:number)=>{const v=Math.round((Number(n)||0)*100)/100;const s=Math.abs(v).toLocaleString('en-IN',{minimumFractionDigits:v%1?2:0,maximumFractionDigits:2});return `${v<0?'−':''}₹${s}`;};
/** "30 SEP 2026" as on the studio's invoices. */
const MONTHS=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
export const pdfDate=(d?:string)=>{if(!d)return '';const t=new Date(d.slice(0,10)+'T12:00:00Z');return isNaN(t.getTime())?'':`${t.getUTCDate()} ${MONTHS[t.getUTCMonth()]} ${t.getUTCFullYear()}`;};
/** "1 Session", "2 Sessions", or just the number. */
export const pdfQty=(q:number,unit?:string)=>{const n=Number(q)||0;const u=(unit||'').trim();if(!u)return String(n);return `${n} ${n!==1&&!/s$/i.test(u)?u+'s':u}`;};

/** Split text into lines that fit `width`, keeping the author's own line breaks. */
export function wrap(text:string,font:PDFFont,size:number,width:number){
 const out:string[]=[];
 for(const para of String(text||'').replace(/\r/g,'').split('\n')){
  if(!para.trim())continue;
  let line='';
  for(const word of para.trim().split(/\s+/)){
   const next=line?`${line} ${word}`:word;
   if(font.widthOfTextAtSize(next,size)<=width){line=next;continue;}
   if(line)out.push(line);
   let rest=word;while(font.widthOfTextAtSize(rest,size)>width&&rest.length>1){let i=rest.length;while(i>1&&font.widthOfTextAtSize(rest.slice(0,i),size)>width)i--;out.push(rest.slice(0,i));rest=rest.slice(i);}
   line=rest;
  }
  if(line)out.push(line);
 }
 return out;
}

type TextOpts={size:number;font:PDFFont;color?:RGB;align?:'left'|'right'|'center';tracking?:number};
const textWidth=(s:string,o:TextOpts)=>o.font.widthOfTextAtSize(s,o.size)+(o.tracking||0)*Math.max(0,[...s].length-1);
function put(page:PDFPage,s:string,x:number,top:number,o:TextOpts){
 if(!s)return;const w=textWidth(s,o);let cx=o.align==='right'?x-w:o.align==='center'?x-w/2:x;const y=H-top;
 if(!o.tracking){page.drawText(s,{x:cx,y,size:o.size,font:o.font,color:o.color??INK});return;}
 for(const ch of s){page.drawText(ch,{x:cx,y,size:o.size,font:o.font,color:o.color??INK});cx+=o.font.widthOfTextAtSize(ch,o.size)+o.tracking;}
}
function logoLetters(page:PDFPage,x:number,y:number,scale:number,letters:RGB,stripes?:RGB){
 page.drawSvgPath(LOGO.letters.d,{x,y,scale,color:letters});
 for(const s of LOGO.stripes)page.drawSvgPath(s.d,{x,y,scale,color:stripes??hex(s.fill)});
}

export async function buildDocumentPdf({kind,doc,client,paid=0,terms=DEFAULT_TERMS,fonts}:DocumentPdfInput):Promise<Uint8Array>{
 const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);
 // Fonts are pre-trimmed, so they are embedded whole (pdf-lib's own subsetting drops Inter glyphs).
 const [regular,bold,italic,light,display]=await Promise.all([fonts.regular,fonts.bold,fonts.italic,fonts.lightItalic,fonts.display].map(f=>pdf.embedFont(f,{subset:false})));
 const LABEL=kind==='invoice'?'INVOICE':'ESTIMATE';
 pdf.setTitle(`${doc.number||LABEL} · ${client?.name||doc.name||''}`.trim());pdf.setAuthor(`${BRAND.word} ${BRAND.sub}`);pdf.setCreator('GRID OS');pdf.setProducer('GRID OS');pdf.setCreationDate(new Date());

 const items:Item[]=Array.isArray(doc.items)?doc.items:[];const sum=totals(items,Number(doc.discount)||0);

 const first=pdf.addPage([W,H]);let page=first;
 // Watermark: the GRID logo letters, oversized and faint, bleeding off the top-left
 logoLetters(first,-132,H+222,0.314,WATERMARK,WATERMARK);
 // Wordmark
 const wordmark:TextOpts={size:99,font:display,color:ORANGE,tracking:-6.6};
 put(first,BRAND.word,38.6,159.94,wordmark);
 put(first,BRAND.sub,240.36,72,{size:19.22,font:light,color:BROWN,tracking:-0.4});
 // Document type and number
 put(first,LABEL,COL.right,73.5,{size:10,font:regular,align:'right'});
 put(first,String(doc.number||'DRAFT'),COL.right,139.06,{size:9.41,font:regular,align:'right'});
 // Client block: with an address it sits higher, otherwise it lines up with the date
 const address=wrap([client?.billing_address,client?.tax_id&&`GSTIN ${client.tax_id}`].filter(Boolean).join('\n'),regular,8,250);
 const phone=client?.phone?String(client.phone):'';
 let cy=address.length?213.94:240.35;
 put(first,client?.name||'Client',44.35,cy,{size:12,font:bold});
 if(address.length){cy+=24.5;for(const l of address){put(first,l,44.35,cy,{size:8,font:regular});cy+=9.2;}if(phone){cy+=10.4;put(first,phone,44.35,cy,{size:8,font:regular});}}
 else if(phone)put(first,phone,44.35,cy+15.6,{size:9.41,font:regular});
 // Date
 put(first,`${LABEL} DATE`,552.9,240.35,{size:12,font:bold,align:'right'});
 put(first,pdfDate(doc.issue_date),COL.right,255.95,{size:9.41,font:regular,align:'right'});
 if(kind==='estimate'&&doc.valid_until)put(first,`VALID UNTIL ${pdfDate(doc.valid_until)}`,COL.right,269,{size:8,font:regular,align:'right'});

 // Table
 const tableHeader=(p:PDFPage,top:number)=>{
  put(p,'DESCRIPTION',43.44,top,{size:12,font:bold});put(p,'RATE',COL.rate,top,{size:12,font:bold,align:'center'});put(p,'QTY',COL.qty,top,{size:12,font:bold,align:'center'});put(p,'AMOUNT',549.3,top-2,{size:12,font:bold,align:'right'});
  p.drawRectangle({x:42.7,y:H-(top+17.9),width:507.9,height:0.72,color:RULE});
  return top+52.35;
 };
 let y=tableHeader(first,340.44);
 const termsLines=terms.flatMap(t=>wrap(t,italic,9,360));
 const bottomLimit=termsLines.length?730-Math.max(0,termsLines.length-2)*15:780;
 const nameWidth=COL.rate-COL.left-60;
 for(const it of items){
  const names=wrap(it.service||'',bold,13.2,nameWidth);const subs=wrap(it.description||'',regular,8,nameWidth);
  const height=(names.length-1)*16+(subs.length?subs.length*10.6+6:0)+39.3;
  if(y+height-39.3>bottomLimit-90){page=pdf.addPage([W,H]);y=tableHeader(page,70);}
  let ny=y;for(const n of names){put(page,n,COL.left,ny,{size:13.2,font:bold});ny+=16;}
  let sy=ny-16+19.5;for(const s of subs){put(page,s,COL.left,sy,{size:8,font:regular});sy+=10.6;}
  const vy=y-1.9;
  put(page,pdfMoney(it.rate),COL.rate,vy,{size:11,font:regular,align:'center'});
  put(page,pdfQty(it.quantity,it.unit),COL.qty,vy,{size:11,font:regular,align:'center'});
  put(page,pdfMoney((Number(it.quantity)||0)*(Number(it.rate)||0)),COL.amount,vy-1.7,{size:11,font:regular,align:'right'});
  y+=height;
 }

 // Totals: breakdown only when there is tax or a discount (the studio's own invoices show just TOTAL)
 let ty=y-39.3+64;
 const breakdown:[string,string][]=[...(sum.discount||sum.tax?[['SUBTOTAL',pdfMoney(sum.subtotal)] as [string,string]]:[]),...(sum.discount?[['DISCOUNT',`−${pdfMoney(sum.discount)}`] as [string,string]]:[]),...(sum.tax?[['GST',pdfMoney(sum.tax)] as [string,string]]:[])];
 const need=breakdown.length*16+60+(kind==='invoice'&&paid>0?22:0);
 if(ty+need>bottomLimit){page=pdf.addPage([W,H]);ty=90;}
 if(breakdown.length){let by=ty-18;for(const [k,v] of breakdown){put(page,k,470,by,{size:8.5,font:regular,align:'right'});put(page,v,COL.amount,by,{size:9.5,font:regular,align:'right'});by+=16;}ty=by+18;}
 const totalText=pdfMoney(sum.total);const totalOpts:TextOpts={size:23.27,font:bold,align:'right'};
 put(page,totalText,549,ty,totalOpts);
 put(page,'TOTAL',549-textWidth(totalText,totalOpts)-6.5,ty-3.3,{size:11,font:regular,align:'right'});
 if(kind==='invoice'&&paid>0){put(page,`PAID ${pdfMoney(paid)}   ·   BALANCE DUE ${pdfMoney(sum.total-paid)}`,549,ty+20,{size:8.5,font:regular,align:'right'});}

 // Terms (anchored to the bottom of the last page) and the small logo
 if(termsLines.length){let top=746.04-Math.max(0,termsLines.length-2)*15;put(page,'TERMS & CONDITIONS',41.54,top,{size:9,font:bold});top+=17.3;for(const l of termsLines){put(page,l,40.82,top,{size:9,font:italic});top+=15;}}
 for(const p of pdf.getPages())logoLetters(p,522,84.5,0.0204,INK);
 if(pdf.getPageCount()>1)pdf.getPages().forEach((p,i)=>put(p,`${i+1} / ${pdf.getPageCount()}`,W/2,806,{size:7.5,font:regular,align:'center',color:rgb(0.5,0.5,0.5)}));
 return pdf.save();
}

/** "TS-00211.pdf" — the document number, like the studio's own files. */
export const pdfFileName=(doc:Row)=>`${String(doc.number||'Draft').replace(/[\\/:*?"<>|]+/g,'-').trim()}.pdf`;
