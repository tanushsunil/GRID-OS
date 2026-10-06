import {reply} from '@/lib/api';
/** Speed check for the live site: where the server runs, which version is live, and how long a
 *  round trip to Supabase takes. Reveals no keys or data. */
export const dynamic='force-dynamic';
export async function GET(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 const timings:number[]=[];let reachable=false;
 if(url&&key){
  for(let i=0;i<3;i++){
   const t=Date.now();
   try{const r=await fetch(`${url}/auth/v1/health`,{headers:{apikey:key},cache:'no-store',signal:AbortSignal.timeout(8000)});reachable=r.ok||reachable;}catch{}
   timings.push(Date.now()-t);
  }
 }
 const best=timings.length?Math.min(...timings):null;
 return reply({
  version:process.env.VERCEL_GIT_COMMIT_SHA?.slice(0,7)??'local',
  serverRegion:process.env.VERCEL_REGION??'local',
  supabaseConnected:!!(url&&key),supabaseReachable:reachable,
  supabaseRoundTripMs:timings,
  verdict:best===null?'Supabase is not configured.':best<40?'Fast: server and database are close together.':best<120?'OK: some distance between server and database.':'Slow: the server is far from the database. Move the Vercel function region next to your Supabase region.',
 });
}
