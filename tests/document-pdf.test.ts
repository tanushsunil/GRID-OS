import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'fs';
import {PDFDocument} from 'pdf-lib';
import {buildDocumentPdf,pdfMoney,pdfDate,pdfQty,pdfFileName,PDF_FONT_FILES} from '../lib/document-pdf';

const fonts=Object.fromEntries(Object.entries(PDF_FONT_FILES).map(([k,url])=>[k,readFileSync(url)])) as any;

test('invoice formatting matches the studio style',()=>{
 assert.equal(pdfMoney(5920),'₹5,920');assert.equal(pdfMoney(120000),'₹1,20,000');assert.equal(pdfMoney(1234.5),'₹1,234.50');
 assert.equal(pdfDate('2026-09-30'),'30 SEP 2026');assert.equal(pdfDate('2026-09-01'),'1 SEP 2026');assert.equal(pdfDate('bad'),'');
 assert.equal(pdfQty(37),'37');assert.equal(pdfQty(1,'Session'),'1 Session');assert.equal(pdfQty(2,'Session'),'2 Sessions');assert.equal(pdfQty(3,'Reels'),'3 Reels');
 assert.equal(pdfFileName({id:'x',number:'TS-00211'}),'TS-00211.pdf');assert.equal(pdfFileName({id:'x',number:'A/B:1'}),'A-B-1.pdf');
});

test('builds a valid one-page A4 invoice, and paginates long ones',async()=>{
 const doc={id:'d',number:'TS-00211',issue_date:'2026-09-30',items:[{service:'Sarees',description:'',quantity:37,rate:160,tax:0}]};
 const bytes=await buildDocumentPdf({kind:'invoice',doc,client:{id:'c',name:'The S Studio Clothing',phone:'+91 91221 23829'},fonts});
 assert.equal(Buffer.from(bytes.slice(0,5)).toString(),'%PDF-');
 const pdf=await PDFDocument.load(bytes);assert.equal(pdf.getPageCount(),1);const {width,height}=pdf.getPage(0).getSize();assert.equal(Math.round(width),595);assert.equal(Math.round(height),842);
 assert.ok(bytes.length<200_000,`PDF should stay small (got ${bytes.length} bytes)`);
 const long={...doc,items:Array.from({length:30},(_,i)=>({service:`Line ${i+1}`,description:'Detail one\nDetail two',quantity:1,rate:1000,tax:18}))};
 const many=await PDFDocument.load(await buildDocumentPdf({kind:'estimate',doc:long,fonts}));assert.ok(many.getPageCount()>1,'long documents continue on more pages');
});

test('invoice settings decide the lines under the total',async()=>{
 const {summaryLines}=await import('../lib/document-pdf');const {invoiceSettings}=await import('../lib/invoice-settings');
 const sum={subtotal:15000,discount:2000,tax:2340,total:15340};
 const all=summaryLines('invoice',sum,5000,invoiceSettings({}));
 assert.deepEqual(all.breakdown.map(b=>b[0]),['SUBTOTAL','DISCOUNT','GST']);assert.equal(all.paidLine,'PAID ₹5,000   ·   BALANCE DUE ₹10,340');
 const none=summaryLines('invoice',sum,5000,invoiceSettings({gst:false,subtotal:false,paid:false,balance:false}));
 assert.deepEqual(none.breakdown,[]);assert.equal(none.paidLine,'');
 assert.equal(summaryLines('invoice',sum,5000,invoiceSettings({paid:false})).paidLine,'BALANCE DUE ₹10,340');
 assert.deepEqual(summaryLines('invoice',sum,5000,invoiceSettings({subtotal:false})).breakdown.map(b=>b[0]),['GST']);
 assert.equal(summaryLines('estimate',sum,5000,invoiceSettings({})).paidLine,'','estimates never show payments');
 assert.equal(summaryLines('invoice',sum,0,invoiceSettings({})).paidLine,'','nothing paid yet: no paid/balance line');
 assert.deepEqual(summaryLines('invoice',{subtotal:100,discount:0,tax:0,total:100},0,invoiceSettings({})).breakdown,[],'nothing to break down');
});
