-- Optional unit for estimate and invoice lines, shown with the quantity (e.g. "2 Sessions").
alter table public.estimate_items add column if not exists unit text check (unit is null or char_length(unit) <= 40);
alter table public.invoice_items add column if not exists unit text check (unit is null or char_length(unit) <= 40);
