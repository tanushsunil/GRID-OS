import {redirect} from 'next/navigation';
import {configured,supabase,currentUser} from '@/lib/supabase';
import Workspace from '@/components/workspace';
export const dynamic='force-dynamic';
export default async function Page(){
 const demo=process.env.GRID_DEMO_MODE==='true';
 if(!demo){if(!configured())redirect('/login');const db=await supabase();const user=await currentUser(db);if(!user)redirect('/login');}
 return <Workspace demo={demo}/>;
}
