import {NextResponse} from 'next/server';
import {supabase} from '@/lib/supabase';
/** Only same-site paths are allowed as a destination (no "//evil.com" or absolute URLs). */
const safeNext=(value:string|null)=>value&&value.startsWith('/')&&!value.startsWith('//')&&!value.includes('\\')?value:'/';
export async function GET(request:Request){
 const url=new URL(request.url);const code=url.searchParams.get('code');const next=safeNext(url.searchParams.get('next'));
 if(code&&code.length<=1024){try{const db=await supabase();const {error}=await db.auth.exchangeCodeForSession(code);if(!error)return NextResponse.redirect(new URL(next,url.origin));}catch(err){console.error('[auth] code exchange failed',err);}}
 return NextResponse.redirect(new URL('/login?error=link',url.origin));
}
