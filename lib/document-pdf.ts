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

type FontData=ArrayBuffer|Uint8Array;
export type PdfFonts={regular:FontData;bold:FontData;italic:FontData;light:FontData;lightItalic:FontData};
/** Helvetica Neue, as on the studio's own invoices — pre-trimmed to Latin + ₹. Kept on the server only
 *  (not in /public): PDFs are built server-side, and only the characters used are embedded in each PDF. */
export const PDF_FONT_FILES:Record<keyof PdfFonts,string>={regular:'assets/pdf-fonts/HelveticaNeue-Regular.ttf',bold:'assets/pdf-fonts/HelveticaNeue-Bold.ttf',italic:'assets/pdf-fonts/HelveticaNeue-Italic.ttf',light:'assets/pdf-fonts/HelveticaNeue-Light.ttf',lightItalic:'assets/pdf-fonts/HelveticaNeue-LightItalic.ttf'};
export type DocumentPdfInput={kind:'invoice'|'estimate';doc:Row;client?:Row;paid?:number;terms?:string[];fonts:PdfFonts};

const W=595.28,H=841.89;
const hexColor=(h:string)=>{const n=parseInt(h.replace('#',''),16);return rgb((n>>16&255)/255,(n>>8&255)/255,(n&255)/255);};
const INK=rgb(0.133,0.133,0.133),ORANGE=rgb(0.969,0.576,0.227),BROWN=rgb(0.29,0.247,0.212),RULE=rgb(0.896,0.896,0.896),WATERMARK=hexColor('#f8f8f8');
const COL={left:43.45,rate:297.7,qty:398.6,amount:547.85,right:549.5};

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
 for(const s of LOGO.stripes)page.drawSvgPath(s.d,{x,y,scale,color:stripes??hexColor(s.fill)});
}

export async function buildDocumentPdf({kind,doc,client,paid=0,terms=DEFAULT_TERMS,fonts}:DocumentPdfInput):Promise<Uint8Array>{
 const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);
 // Only the characters each document uses are embedded (checked with Helvetica Neue: ₹, accents, quotes, dashes).
 const [regular,bold,italic,light,lightItalic]=await Promise.all([fonts.regular,fonts.bold,fonts.italic,fonts.light,fonts.lightItalic].map(f=>pdf.embedFont(f,{subset:true})));
 const display=bold;
 const LABEL=kind==='invoice'?'INVOICE':'ESTIMATE';
 pdf.setTitle(`${doc.number||LABEL} · ${client?.name||doc.name||''}`.trim());pdf.setAuthor(`${BRAND.word} ${BRAND.sub}`);pdf.setCreator('GRID OS');pdf.setProducer('GRID OS');pdf.setCreationDate(new Date());

 const items:Item[]=Array.isArray(doc.items)?doc.items:[];const sum=totals(items,Number(doc.discount)||0);

 const first=pdf.addPage([W,H]);let page=first;
 // Watermark: the GRID logo letters, oversized and faint, bleeding off the top-left
 logoLetters(first,-132,H+222,0.314,WATERMARK,WATERMARK);
 // Wordmark
 const wordmark:TextOpts={size:99,font:display,color:ORANGE,tracking:-8.5};
 put(first,BRAND.word,34.86,160.09,wordmark);
 put(first,BRAND.sub,240.36,72.14,{size:19.22,font:italic,color:BROWN,tracking:-1.15});
 // Document type and number
 put(first,LABEL,COL.right,73.5,{size:10,font:regular,align:'right'});
 put(first,String(doc.number||'DRAFT'),COL.right,139.06,{size:9.41,font:regular,align:'right'});
 // Client block: with an address it sits higher, otherwise it lines up with the date
 const address=wrap([client?.billing_address,client?.tax_id&&`GSTIN ${client.tax_id}`].filter(Boolean).join('\n'),regular,8,250);
 const phone=client?.phone?String(client.phone):'';
 let cy=address.length?213.94:238.81;
 put(first,String(client?.name||'Client').toUpperCase(),44.35,cy,{size:12,font:bold});
 if(address.length){cy+=24.5;for(const l of address){put(first,l,44.35,cy,{size:8,font:regular});cy+=9.2;}if(phone){cy+=10.4;put(first,phone,44.35,cy,{size:8,font:regular});}}
 else if(phone)put(first,phone,44.35,cy+15.36,{size:9.41,font:regular});
 // Date
 put(first,`${LABEL} DATE`,549.4,240.49,{size:12,font:bold,align:'right'});
 put(first,pdfDate(doc.issue_date),COL.right,255.95,{size:9.41,font:regular,align:'right'});
 if(kind==='estimate'&&doc.valid_until)put(first,`VALID UNTIL ${pdfDate(doc.valid_until)}`,COL.right,269,{size:8,font:regular,align:'right'});

 // Table
 const tableHeader=(p:PDFPage,top:number)=>{
  put(p,'DESCRIPTION',43.44,top,{size:12,font:bold});put(p,'RATE',COL.rate,top,{size:12,font:bold,align:'center'});put(p,'QTY',COL.qty,top,{size:12,font:bold,align:'center'});put(p,'AMOUNT',548.05,top-2,{size:12,font:bold,align:'right'});
  p.drawRectangle({x:42.7,y:H-(top+17.9),width:507.9,height:0.72,color:RULE});
  return top+48.89;
 };
 let y=tableHeader(first,340.44);
 const termsLines=terms.flatMap(t=>wrap(t,lightItalic,9,360));
 const bottomLimit=termsLines.length?730-Math.max(0,termsLines.length-2)*15:780;
 const nameWidth=COL.rate-COL.left-60;
 for(const it of items){
  const names=wrap(it.service||'',regular,11,nameWidth);const subs=wrap(it.description||'',light,8.16,nameWidth-11.7);
  // measured from the studio's invoices: service 11pt; details light 8.16pt, indented 11.7pt, 13.2pt apart;
  // the next item starts 38.2pt below the last line
  const last=(names.length-1)*13.5+(subs.length?17.6+(subs.length-1)*13.21:0);
  const height=last+(subs.length?38.16:45);
  if(y+last>bottomLimit-90){page=pdf.addPage([W,H]);y=tableHeader(page,70);}
  let ny=y;for(const n of names){put(page,n,COL.left+1,ny,{size:11,font:regular});ny+=13.5;}
  let sy=ny-13.5+17.6;for(const s of subs){put(page,s,COL.left+12.7,sy,{size:8.16,font:light});sy+=13.21;}
  put(page,pdfMoney(it.rate),COL.rate,y+1.79,{size:11,font:regular,align:'center'});
  put(page,pdfQty(it.quantity,it.unit),COL.qty,y+1.79,{size:11,font:regular,align:'center'});
  put(page,pdfMoney((Number(it.quantity)||0)*(Number(it.rate)||0)),COL.amount,y+0.11,{size:11,font:regular,align:'right'});
  y+=height;
 }

 // Totals: breakdown only when there is tax or a discount (the studio's own invoices show just TOTAL)
 let ty=y-38.16+69.13;
 const breakdown:[string,string][]=[...(sum.discount||sum.tax?[['SUBTOTAL',pdfMoney(sum.subtotal)] as [string,string]]:[]),...(sum.discount?[['DISCOUNT',`−${pdfMoney(sum.discount)}`] as [string,string]]:[]),...(sum.tax?[['GST',pdfMoney(sum.tax)] as [string,string]]:[])];
 const need=breakdown.length*16+60+(kind==='invoice'&&paid>0?22:0);
 if(ty+need>bottomLimit){page=pdf.addPage([W,H]);ty=90;}
 if(breakdown.length){let by=ty-18;for(const [k,v] of breakdown){put(page,k,470,by,{size:8.5,font:regular,align:'right'});put(page,v,COL.amount,by,{size:9.5,font:regular,align:'right'});by+=16;}ty=by+18;}
 const totalText=pdfMoney(sum.total);const totalOpts:TextOpts={size:23.27,font:bold,align:'right'};
 put(page,totalText,547.7,ty,totalOpts);
 put(page,'TOTAL',547.7-textWidth(totalText,totalOpts)-12.8,ty-3.34,{size:11,font:regular,align:'right'});
 if(kind==='invoice'&&paid>0){put(page,`PAID ${pdfMoney(paid)}   ·   BALANCE DUE ${pdfMoney(sum.total-paid)}`,547.7,ty+20,{size:8.5,font:regular,align:'right'});}

 // Terms (anchored to the bottom of the last page) and the small logo
 if(termsLines.length){let top=746.04-Math.max(0,termsLines.length-2)*15;put(page,'TERMS & CONDITIONS',41.54,top,{size:9,font:bold});top+=17.3;for(const l of termsLines){put(page,l,40.82,top,{size:9,font:lightItalic});top+=15.12;}}
 for(const p of pdf.getPages())logoLetters(p,519.42,91.3,0.01996,INK);
 if(pdf.getPageCount()>1)pdf.getPages().forEach((p,i)=>put(p,`${i+1} / ${pdf.getPageCount()}`,W/2,806,{size:7.5,font:regular,align:'center',color:rgb(0.5,0.5,0.5)}));
 return pdf.save();
}

/** "TS-00211.pdf" — the document number, like the studio's own files. */
export const pdfFileName=(doc:Row)=>`${String(doc.number||'Draft').replace(/[\\/:*?"<>|]+/g,'-').trim()}.pdf`;
