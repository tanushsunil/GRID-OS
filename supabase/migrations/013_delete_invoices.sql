-- Deleting invoices.
-- 1. Fix: a draft invoice with line items couldn't be deleted. Removing the invoice removes its items,
--    and the line-item guard then found no invoice and treated the items as "issued".
-- 2. delete_invoice(): drafts for managers; sent or paid invoices (and their payments) for admins only.
--    A deleted monthly invoice is remembered as skipped, so automatic invoicing doesn't recreate it.
-- 3. delete_project() can take the project's invoices with it when asked (same rules as above).
-- (the monthly-invoicing parts only apply if 008_monthly_invoicing.sql has been run)
do $$ begin if to_regclass('public.billing_schedules') is not null then alter table public.billing_schedules add column if not exists skipped text[] not null default '{}'; end if; end $$;

create or replace function public.guard_invoice_item() returns trigger language plpgsql set search_path=public as $$ declare p uuid; st text; begin
 p=case when tg_op='DELETE' then old.invoice_id else new.invoice_id end;
 select status into st from invoices where id=p for update;
 if tg_op='DELETE' and not found then return old; end if; -- the invoice itself is being deleted
 if st is distinct from 'Draft' then raise exception 'Issued invoice items are locked'; end if;
 if tg_op='UPDATE' and new.invoice_id<>old.invoice_id then raise exception 'Cannot move invoice items'; end if;
 return coalesce(new,old); end $$;

create or replace function public.guard_invoice() returns trigger language plpgsql set search_path=public as $$ begin
 if tg_op='DELETE' and old.status<>'Draft' and current_setting('grid.deleting_invoice',true) is distinct from old.id::text then raise exception 'Only drafts can be deleted'; end if;
 if tg_op='UPDATE' and old.status<>'Draft' then
 if (to_jsonb(new)-array['status','updated_at']) is distinct from (to_jsonb(old)-array['status','updated_at']) or new.status not in ('Sent','Cancelled') or exists(select 1 from payments where invoice_id=old.id) then raise exception 'Issued invoice is locked'; end if;
 end if; return coalesce(new,old); end $$;

create or replace function public.guard_payment() returns trigger language plpgsql set search_path=public as $$ declare total numeric; paid numeric; st text; begin
 if tg_op='DELETE' and current_setting('grid.deleting_invoice',true)=old.invoice_id::text then return old; end if;
 if tg_op<>'INSERT' then raise exception 'Payments are immutable'; end if;
 select status into st from invoices where id=new.invoice_id and workspace_id=new.workspace_id for update;
 if st is null or st<>'Sent' then raise exception 'Payments require a sent invoice'; end if;
 total=invoice_total(new.invoice_id); select coalesce(sum(amount),0) into paid from payments where invoice_id=new.invoice_id;
 if new.amount+paid>total then raise exception 'Payment exceeds balance'; end if; return new; end $$;

create or replace function public.delete_invoice(w uuid,i uuid) returns jsonb language plpgsql security invoker set search_path=public as $$
declare inv invoices; n_payments int;
begin
 select * into inv from invoices where id=i and workspace_id=w for update;
 if inv.id is null then raise exception 'This invoice no longer exists'; end if;
 if not is_manager(w) then raise exception 'Only managers and admins can delete invoices'; end if;
 if inv.status<>'Draft' and not is_admin(w) then raise exception 'Only admins can delete an invoice that has been sent'; end if;
 if to_regclass('public.billing_schedules') is not null and to_jsonb(inv)->>'schedule_id' is not null and to_jsonb(inv)->>'billing_period' is not null then
  update billing_schedules set skipped=array_append(skipped,to_jsonb(inv)->>'billing_period') where id=(to_jsonb(inv)->>'schedule_id')::uuid and not ((to_jsonb(inv)->>'billing_period')=any(skipped));
 end if;
 perform set_config('grid.deleting_invoice',i::text,true);
 delete from payments where invoice_id=i and workspace_id=w; get diagnostics n_payments=row_count;
 delete from invoices where id=i and workspace_id=w;
 perform set_config('grid.deleting_invoice','',true);
 return jsonb_build_object('payments',n_payments);
end $$;
revoke execute on function public.delete_invoice(uuid,uuid) from public;
grant execute on function public.delete_invoice(uuid,uuid) to authenticated;

drop function if exists public.delete_project(uuid,uuid);
create function public.delete_project(w uuid,p uuid,with_invoices boolean default false) returns jsonb language plpgsql security invoker set search_path=public as $$
declare n_tasks int; n_deliverables int; n_shoots int; n_rentals int; n_invoices int:=0; r record;
begin
 if not is_manager(w) then raise exception 'Only managers and admins can delete projects'; end if;
 if not exists(select 1 from projects where id=p and workspace_id=w) then raise exception 'This project no longer exists'; end if;
 if exists(select 1 from invoices where project_id=p and workspace_id=w) then
  if not with_invoices then raise exception 'This project has invoices. Delete them too, or move them to another project first.'; end if;
  for r in select id from invoices where project_id=p and workspace_id=w loop perform delete_invoice(w,r.id); n_invoices:=n_invoices+1; end loop;
 end if;
 delete from tasks where project_id=p and workspace_id=w; get diagnostics n_tasks=row_count;
 delete from rentals where project_id=p and workspace_id=w; get diagnostics n_rentals=row_count;
 delete from deliverables where project_id=p and workspace_id=w; get diagnostics n_deliverables=row_count;
 delete from shoots where project_id=p and workspace_id=w; get diagnostics n_shoots=row_count;
 delete from projects where id=p and workspace_id=w;
 return jsonb_build_object('tasks',n_tasks,'deliverables',n_deliverables,'shoots',n_shoots,'rentals',n_rentals,'invoices',n_invoices);
end $$;
revoke execute on function public.delete_project(uuid,uuid,boolean) from public;
grant execute on function public.delete_project(uuid,uuid,boolean) to authenticated;

-- automatic invoicing skips months whose invoice was deleted
do $do$ begin if to_regclass('public.billing_schedules') is not null then execute $fn$
create or replace function public.run_billing(only_workspace uuid,today date) returns int language plpgsql security definer set search_path=public as $$
declare s record; p date; run date; last_day int; created int:=0; inv uuid; item jsonb; proj text; months text[]:=array['January','February','March','April','May','June','July','August','September','October','November','December'];
begin
 for s in select * from billing_schedules where active and (only_workspace is null or workspace_id=only_workspace) loop
  p:=greatest(to_date(s.starts_on||'-01','YYYY-MM-DD'),date_trunc('month',today)::date-interval '11 months')::date;
  while p<=date_trunc('month',today)::date loop
   exit when s.ends_on is not null and to_char(p,'YYYY-MM')>s.ends_on;
   last_day:=extract(day from (p+interval '1 month'-interval '1 day'))::int;
   run:=p+(least(s.day,last_day)-1);
   if run<=today and not (to_char(p,'YYYY-MM')=any(s.skipped)) and not exists(select 1 from invoices where schedule_id=s.id and billing_period=to_char(p,'YYYY-MM')) then
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
$fn$; end if; end $do$;

notify pgrst, 'reload schema';
