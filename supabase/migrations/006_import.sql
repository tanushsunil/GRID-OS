-- Bulk import of older invoices. One call imports a whole batch in a single transaction:
-- if any invoice fails, nothing from that batch is saved. Runs with the caller's own permissions
-- (managers and admins only), so workspace access rules still apply.
create function public.import_invoices(w uuid, invoices jsonb) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare inv jsonb; item jsonb; c uuid; p uuid; i uuid; made_clients int:=0; made_projects int:=0; n int:=0;
begin
 if not is_manager(w) then raise exception 'Not allowed'; end if;
 if jsonb_typeof(invoices)<>'array' or jsonb_array_length(invoices)>2000 then raise exception 'Import up to 2000 invoices at a time'; end if;
 for inv in select * from jsonb_array_elements(invoices) loop
  -- client: reuse one with the same name, otherwise create it
  select id into c from clients where workspace_id=w and lower(name)=lower(trim(inv->>'client')) order by created_at limit 1;
  if c is null then
   insert into clients(workspace_id,name) values(w,left(trim(inv->>'client'),500)) returning id into c; made_clients:=made_clients+1;
  end if;
  -- project: reuse that client's project with the same name, otherwise create it as Completed
  select id into p from projects where workspace_id=w and client_id=c and lower(name)=lower(trim(inv->>'project')) order by created_at limit 1;
  if p is null then
   insert into projects(workspace_id,name,client_id,status,start_date) values(w,left(trim(inv->>'project'),500),c,'Completed',(inv->>'issue_date')::date) returning id into p; made_projects:=made_projects+1;
  end if;
  -- invoice starts as a draft so its line items can be added, then takes its real status
  insert into invoices(workspace_id,name,number,client_id,project_id,issue_date,due_date,discount,notes,payment_terms,status)
   values(w,left(inv->>'name',500),coalesce(nullif(trim(inv->>'number'),''),'INV-'||lpad(nextval('public.document_number_seq')::text,5,'0')),c,p,
    (inv->>'issue_date')::date,(inv->>'due_date')::date,coalesce((inv->>'discount')::numeric,0),nullif(inv->>'notes',''),nullif(inv->>'payment_terms',''),'Draft')
   returning id into i;
  for item in select * from jsonb_array_elements(inv->'items') loop
   insert into invoice_items(workspace_id,invoice_id,service,description,quantity,unit,rate,tax)
    values(w,i,left(item->>'service',500),nullif(item->>'description',''),(item->>'quantity')::numeric,nullif(left(item->>'unit',40),''),(item->>'rate')::numeric,coalesce((item->>'tax')::numeric,0));
  end loop;
  if inv->>'status' in ('Sent','Cancelled') then update invoices set status=inv->>'status' where id=i; end if;
  if coalesce((inv->>'amount_paid')::numeric,0)>0 then
   insert into payments(workspace_id,invoice_id,amount,date,method,reference)
    values(w,i,(inv->>'amount_paid')::numeric,coalesce((inv->>'payment_date')::date,(inv->>'due_date')::date),nullif(inv->>'payment_method',''),'Imported');
  end if;
  n:=n+1;
 end loop;
 return jsonb_build_object('invoices',n,'clients',made_clients,'projects',made_projects);
end $$;
revoke execute on function public.import_invoices(uuid,jsonb) from public;
grant execute on function public.import_invoices(uuid,jsonb) to authenticated;
