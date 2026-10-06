-- Production cost per project, used for profit and margin insights.
alter table public.projects add column if not exists cost numeric(14,2) check (cost is null or cost >= 0);
