import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {PDF_FONT_FILES,type PdfFonts} from './document-pdf';

/** Server only: the PDF fonts, read once per server instance (a failed read is retried next time). */
let fonts:Promise<PdfFonts>|null=null;
export const loadPdfFonts=()=>fonts??=Promise.all(Object.entries(PDF_FONT_FILES).map(async([k,file])=>[k,await readFile(path.join(process.cwd(),file))] as const))
 .then(e=>Object.fromEntries(e) as unknown as PdfFonts).catch(err=>{fonts=null;throw err;});
