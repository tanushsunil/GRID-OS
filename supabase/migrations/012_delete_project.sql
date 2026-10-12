-- Delete a project together with its production work (tasks, deliverables, shoots, rentals; team
-- assignments and the monthly invoicing schedule go automatically). Projects with invoices are kept —
-- invoices are financial records and must be dealt with first. One transaction: all or nothing.
create function public.delete_project(w uuid,p uuid) returns jsonb language plpgsql security invoker set search_path=public as $$
declare n_tasks int; n_deliverables int; n_shoots int; n_rentals int;
begin
 if not is_manager(w) then raise exception 'Only managers and admins can delete projects'; end if;
 if not exists(select 1 from projects where id=p and workspace_id=w) then raise exception 'This project no longer exists'; end if;
 if exists(select 1 from invoices where project_id=p and workspace_id=w) then
  raise exception 'This project has invoices. Delete its draft invoices or move them to another project first — issued invoices are kept for your records.';
 end if;
 delete from tasks where project_id=p and workspace_id=w; get diagnostics n_tasks=row_count;
 delete from rentals where project_id=p and workspace_id=w; get diagnostics n_rentals=row_count;
 delete from deliverables where project_id=p and workspace_id=w; get diagnostics n_deliverables=row_count;
 delete from shoots where project_id=p and workspace_id=w; get diagnostics n_shoots=row_count;
 delete from projects where id=p and workspace_id=w;
 return jsonb_build_object('tasks',n_tasks,'deliverables',n_deliverables,'shoots',n_shoots,'rentals',n_rentals);
end $$;
revoke execute on function public.delete_project(uuid,uuid) from public;
grant execute on function public.delete_project(uuid,uuid) to authenticated;
notify pgrst, 'reload schema';
