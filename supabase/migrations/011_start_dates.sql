-- Tasks and deliverables can span several days on the roadmap: a start date alongside the due date.
alter table public.tasks add column if not exists start_date date;
alter table public.deliverables add column if not exists start_date date;
alter table public.tasks add constraint tasks_start_before_due check (start_date is null or due_date is null or start_date<=due_date);
alter table public.deliverables add constraint deliverables_start_before_due check (start_date is null or due_date is null or start_date<=due_date);
notify pgrst, 'reload schema';
