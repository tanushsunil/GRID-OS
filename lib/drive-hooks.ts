import {after} from 'next/server';
import {googleConfigured} from './google-drive';
import {syncWorkspaceInvoices} from './drive-sync';

/** After the response is sent, bring this workspace's Drive invoice folder up to date (no-op if Drive isn't set up). */
export function queueDriveSync(workspaceId:string|null|undefined){
 if(!workspaceId||!googleConfigured()||!process.env.SUPABASE_SECRET_KEY)return;
 after(async()=>{await syncWorkspaceInvoices(workspaceId);});
}
