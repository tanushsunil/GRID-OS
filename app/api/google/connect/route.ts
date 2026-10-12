import {NextResponse} from 'next/server';
import {randomBytes} from 'node:crypto';
import {configured,supabase,currentUser} from '@/lib/supabase';
import {authUrl,googleConfigured} from '@/lib/google-drive';
import {z} from 'zod';

/** Start connecting Google Drive: managers only; sends the browser to Google's sign-in. */
export async function GET(request:Request){
 const url=new URL(request.url);const back=(q:string)=>NextResponse.redirect(new URL(`/settings?drive=${q}`,url.origin));
 if(!configured()||!googleConfigured())return back('not-configured');
 const workspace=z.uuid().safeParse(url.searchParams.get('workspace'));if(!workspace.success)return back('error');
 const db=await supabase();if(!(await currentUser(db)))return NextResponse.redirect(new URL('/login',url.origin));
 const {data:status}=await db.rpc('drive_status',{w:workspace.data});if(!status)return back('not-allowed');
 const state=randomBytes(24).toString('base64url');
 const res=NextResponse.redirect(authUrl(state,new URL('/api/google/callback',url.origin).href));
 res.cookies.set('grid-google-state',`${state}.${workspace.data}`,{httpOnly:true,secure:url.protocol==='https:',sameSite:'lax',maxAge:600,path:'/api/google'});
 return res;
}
