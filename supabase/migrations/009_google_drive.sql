-- Save every invoice as a PDF into a Google Drive folder, organised Year → Month.
-- Both tables have no access policies: only the server (secret key) reads or writes them, so the Google
-- connection token is never exposed to browsers. Managers see the connection status through drive_status().
create table public.drive_connections(
 workspace_id uuid primary key references public.workspaces on delete cascade,
 refresh_token text not null,
 google_email text,
 folder_id text, folder_name text,
 connected_by uuid references auth.users(id) on delete set null,
 connected_at timestamptz not null default now(),
 last_synced_at timestamptz, last_error text,
 sync_lease timestamptz      -- short lease so two syncs for one workspace never run at the same time
);
alter table public.drive_connections enable row level security;

create table public.drive_files(
 invoice_id uuid primary key,          -- no foreign key on purpose: when an invoice is deleted, its file is tidied up
 workspace_id uuid not null references public.workspaces on delete cascade,
 file_id text not null,
 folder_id text not null,
 content_hash text not null,           -- what the PDF was built from; a change means the file is refreshed
 synced_at timestamptz not null default now()
);
alter table public.drive_files enable row level security;
create index on public.drive_files(workspace_id);

-- What a manager may see about their workspace's Drive connection (never the token).
create function public.drive_status(w uuid) returns jsonb language sql stable security definer set search_path=public as $$
 select case when not is_manager(w) then null else coalesce((
  select jsonb_build_object('connected',true,'email',google_email,'folder_id',folder_id,'folder_name',folder_name,
   'last_synced_at',last_synced_at,'last_error',last_error,'files',(select count(*) from drive_files f where f.workspace_id=w))
  from drive_connections where workspace_id=w),jsonb_build_object('connected',false)) end
$$;
revoke execute on function public.drive_status(uuid) from public;
grant execute on function public.drive_status(uuid) to authenticated;
notify pgrst, 'reload schema';
