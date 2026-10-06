-- Rental gear booked for projects and shoots. Costs roll up as shoot expenses.
create table public.rentals(
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces,
 project_id uuid not null,
 shoot_id uuid,
 name text not null,
 category text check (category is null or category in ('Camera','Lens','Lighting','Grip','Audio','Drone','Monitor','Vehicle','Studio','Other')),
 vendor text,
 quantity numeric(10,2) not null default 1 check (quantity > 0),
 rate numeric(14,2) not null default 0 check (rate >= 0),
 days numeric(6,1) check (days is null or days > 0),
 start_date date,
 end_date date,
 reference text,
 notes text,
 status text not null default 'Booked' check (status in ('Requested','Booked','Picked Up','Returned','Cancelled')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(workspace_id,id),
 check (end_date is null or start_date is null or end_date >= start_date),
 foreign key(workspace_id,project_id) references public.projects(workspace_id,id),
 foreign key(workspace_id,shoot_id) references public.shoots(workspace_id,id)
);
alter table public.rentals enable row level security;
create trigger touch before update on public.rentals for each row execute function public.touch_record();
create index on public.rentals(workspace_id);
create index on public.rentals(project_id);
-- Rental costs are financial data: managers and admins only.
create policy manager_read on public.rentals for select to authenticated using (is_manager(workspace_id));
create policy manager_write on public.rentals for all to authenticated using (is_manager(workspace_id)) with check (is_manager(workspace_id));
-- Tables added after 001 need their own access grant (Supabase doesn't always add one automatically).
grant select,insert,update,delete on public.rentals to authenticated;
