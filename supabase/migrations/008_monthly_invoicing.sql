-- Automatic monthly invoicing. A project can have a billing schedule; on its billing day each month
-- (the 29th by default, or the month's last day if shorter) a DRAFT invoice for that month is created,
-- ready to review and send. Each month is invoiced at most once (unique schedule + period).
create table public.billing_schedules(
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces on delete cascade,
 project_id uuid not null,
 client_id uuid not null,
 items jsonb not null check (jsonb_typeof(items)='array' and jsonb_array_length(items) between 1 and 100),
 discount numeric(14,2) not null default 0 check (discount>=0),
 payment_terms text, notes text,
 day smallint not null default 29 check (day between 1 and 31),
 due_days smallint not null default 7 check (due_days between 0 and 120),
 starts_on text not null check (starts_on ~ '^\d{4}-\d{2}$'),
 ends_on text check (ends_on is null or (ends_on ~ '^\d{4}-\d{2}$' and ends_on>=starts_on)),
 active boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(workspace_id,project_id),
 foreign key(workspace_id,project_id) references public.projects(workspace_id,id) on delete cascade,
 foreign key(workspace_id,client_id) references public.clients(workspace_id,id)
);
alter table public.billing_schedules enable row level security;
create trigger touch before update on public.billing_schedules for each row execute function public.touch_record();
create policy manager_all on public.billing_schedules for all to authenticated using (is_manager(workspace_id)) with check (is_manager(workspace_id));
grant select,insert,update,delete on public.billing_schedules to authenticated;

alter table public.invoices add column schedule_id uuid references public.billing_schedules(id) on delete set null;
alter table public.invoices add column billing_period text check (billing_period is null or billing_period ~ '^\d{4}-\d{2}$');
create unique index invoices_schedule_period on public.invoices(schedule_id,billing_period) where schedule_id is not null;

-- Create every invoice that is due by `today` for the given schedules (catching up at most 12 months).
-- Returns how many were created. Safe to run any number of times.
create function public.run_billing(only_workspace uuid,today date) returns int language plpgsql security definer set search_path=public as $$
declare s record; p date; run date; last_day int; created int:=0; inv uuid; item jsonb; proj text; months text[]:=array['January','February','March','April','May','June','July','August','September','October','November','December'];
begin
 for s in select * from billing_schedules where active and (only_workspace is null or workspace_id=only_workspace) loop
  p:=greatest(to_date(s.starts_on||'-01','YYYY-MM-DD'),date_trunc('month',today)::date-interval '11 months')::date;
  while p<=date_trunc('month',today)::date loop
   exit when s.ends_on is not null and to_char(p,'YYYY-MM')>s.ends_on;
   last_day:=extract(day from (p+interval '1 month'-interval '1 day'))::int;
   run:=p+(least(s.day,last_day)-1);
   if run<=today and not exists(select 1 from invoices where schedule_id=s.id and billing_period=to_char(p,'YYYY-MM')) then
    select name into proj from projects where id=s.project_id;
    inv:=null; -- reset: on a conflict, RETURNING gives nothing
    insert into invoices(workspace_id,name,client_id,project_id,issue_date,due_date,discount,payment_terms,notes,status,schedule_id,billing_period)
     values(s.workspace_id,left(coalesce(proj,'Monthly invoice')||' — '||months[extract(month from p)::int]||' '||extract(year from p)::int,500),s.client_id,s.project_id,run,run+s.due_days,s.discount,s.payment_terms,s.notes,'Draft',s.id,to_char(p,'YYYY-MM'))
     on conflict do nothing returning id into inv;
    if inv is not null then
     for item in select * from jsonb_array_elements(s.items) loop
      insert into invoice_items(workspace_id,invoice_id,service,description,quantity,unit,rate,tax)
       values(s.workspace_id,inv,left(item->>'service',500),nullif(item->>'description',''),(item->>'quantity')::numeric,nullif(left(item->>'unit',40),''),(item->>'rate')::numeric,coalesce((item->>'tax')::numeric,0));
     end loop;
     created:=created+1;
    end if;
   end if;
   p:=(p+interval '1 month')::date;
  end loop;
 end loop;
 return created;
end $$;

-- For managers when they open GRID OS: catch up their own workspace (backup for the daily job).
create function public.run_my_billing(w uuid) returns int language plpgsql security definer set search_path=public as $$
begin
 if not is_manager(w) then return 0; end if;
 return run_billing(w,(now() at time zone 'Asia/Kolkata')::date);
end $$;

-- For the daily scheduled job (server only): every workspace.
create function public.run_all_billing() returns int language sql security definer set search_path=public as $$
 select run_billing(null,(now() at time zone 'Asia/Kolkata')::date)
$$;

revoke execute on function public.run_billing(uuid,date),public.run_my_billing(uuid),public.run_all_billing() from public;
grant execute on function public.run_my_billing(uuid) to authenticated;
do $$ begin
 if exists(select 1 from pg_roles where rolname='anon') then revoke execute on function public.run_billing(uuid,date),public.run_all_billing() from anon; end if;
 if exists(select 1 from pg_roles where rolname='authenticated') then revoke execute on function public.run_billing(uuid,date),public.run_all_billing() from authenticated; end if;
 if exists(select 1 from pg_roles where rolname='service_role') then grant execute on function public.run_all_billing() to service_role; end if;
end $$;
notify pgrst, 'reload schema';
