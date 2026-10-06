/** Reading and writing tables as CSV or Excel (.xlsx). Cells come back as strings, numbers, dates or null. */
export type Cell=string|number|boolean|Date|null;
export type Table={headers:string[];rows:Cell[][]};
export const MAX_IMPORT_ROWS=5000;

/** RFC 4180 CSV: quoted fields, "" escapes, line breaks inside quotes, CRLF, a leading UTF-8 BOM,
 *  and comma, semicolon or tab separators (whichever the header line uses). */
export function parseCsv(text:string):string[][]{
 const src=text.replace(/^﻿/,'');
 const sep=detectSeparator(src);
 const rows:string[][]=[];let row:string[]=[];let field='';let quoted=false;
 for(let i=0;i<src.length;i++){
  const ch=src[i];
  if(quoted){
   if(ch==='"'){if(src[i+1]==='"'){field+='"';i++;}else quoted=false;}
   else field+=ch;
  }else if(ch==='"'&&field==='')quoted=true;
  else if(ch===sep){row.push(field);field='';}
  else if(ch==='\n'||ch==='\r'){if(ch==='\r'&&src[i+1]==='\n')i++;row.push(field);rows.push(row);row=[];field='';}
  else field+=ch;
 }
 if(field!==''||row.length){row.push(field);rows.push(row);}
 return rows.filter(r=>r.some(c=>c.trim()!==''));
}
function detectSeparator(src:string){
 let quoted=false;const counts:Record<string,number>={',':0,';':0,'\t':0};
 for(const ch of src){if(ch==='"')quoted=!quoted;else if(!quoted&&(ch==='\n'||ch==='\r'))break;else if(!quoted&&ch in counts)counts[ch]++;}
 const [best,n]=Object.entries(counts).sort((a,b)=>b[1]-a[1])[0];
 return n>0?best:',';
}

const iso=(d:Date)=>`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
/** CSV text with a BOM so Excel opens ₹ and accented names correctly. Dates are written as YYYY-MM-DD. */
export function toCsv(headers:string[],rows:Cell[][]){
 const cell=(v:Cell)=>{const s=v==null?'':v instanceof Date?iso(v):String(v);return /[",\r\n;]/.test(s)||/^\s|\s$/.test(s)?`"${s.replace(/"/g,'""')}"`:s;};
 return '﻿'+[headers,...rows].map(r=>r.map(cell).join(',')).join('\r\n')+'\r\n';
}

/** Read the first sheet of an .xlsx, or a .csv, into headers + rows. */
export async function readTable(file:File):Promise<Table>{
 const name=file.name.toLowerCase();
 if(file.size>15*1024*1024)throw Error('That file is larger than 15 MB. Split it into smaller files and import them one at a time.');
 let grid:Cell[][];
 if(name.endsWith('.csv')||name.endsWith('.txt')||file.type==='text/csv')grid=parseCsv(await file.text());
 else if(name.endsWith('.xlsx')){
  const {readSheet}=await import('read-excel-file/browser');
  try{grid=(await readSheet(file)) as Cell[][];}catch{throw Error('That Excel file couldn’t be read. Open it in Excel or Google Sheets and save it again as .xlsx or .csv.');}
 }else if(name.endsWith('.xls')||name.endsWith('.numbers'))throw Error('Older .xls and Numbers files aren’t supported. Save the file as .xlsx or .csv first.');
 else throw Error('Choose a .csv or .xlsx file.');
 const rows=grid.filter(r=>r&&r.some(c=>c!==null&&String(c).trim()!==''));
 if(!rows.length)throw Error('That file is empty.');
 const headers=rows[0].map((h,i)=>String(h??'').trim()||`Column ${i+1}`);
 const body=rows.slice(1);
 if(!body.length)throw Error('That file only has a header row — there’s nothing to import.');
 if(body.length>MAX_IMPORT_ROWS)throw Error(`That file has ${body.length} rows. Import up to ${MAX_IMPORT_ROWS} at a time by splitting it into smaller files.`);
 return {headers,rows:body};
}

/** Build an .xlsx file: a bold header row, dates shown as e.g. 07 Oct 2026, numbers kept as numbers. */
export async function toXlsx(headers:string[],rows:Cell[][],sheet='Sheet1'):Promise<Blob>{
 const {default:writeXlsxFile}=await import('write-excel-file/browser');
 const {data,options}=xlsxSheet(headers,rows,sheet);
 return writeXlsxFile(data as any,options as any).toBlob();
}
/** Sheet data and options for write-excel-file (shared by the browser export and the tests). YYYY-MM-DD text becomes real dates. */
export function xlsxSheet(headers:string[],rows:Cell[][],sheet='Sheet1'){
 const dateText=/^\d{4}-\d{2}-\d{2}$/;
 const head=headers.map(h=>({value:h,fontWeight:'bold' as const}));
 const body=rows.map(r=>r.map(v=>v==null||v===''?null:v instanceof Date?{value:v,type:Date,format:'dd mmm yyyy'}:typeof v==='string'&&dateText.test(v)?{value:new Date(v+'T00:00:00Z'),type:Date,format:'dd mmm yyyy'}:typeof v==='number'?{value:v,type:Number}:{value:String(v),type:String}));
 const widths=headers.map((h,i)=>({width:Math.min(48,Math.max(10,h.length+2,...rows.slice(0,200).map(r=>String(r[i]??'').length+2)))}));
 return {data:[head,...body],options:{sheet,columns:widths,stickyRowsCount:1}};
}
