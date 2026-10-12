import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {reply} from '@/lib/api';

/** The changelog shown in Settings → What's new (read straight from CHANGELOG.md, so it's always current). */
export async function GET(){
 try{return reply({markdown:await readFile(path.join(process.cwd(),'CHANGELOG.md'),'utf8')});}
 catch{return reply({error:'The changelog isn’t available right now.'},503);}
}
