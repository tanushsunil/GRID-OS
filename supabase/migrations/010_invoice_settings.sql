-- What the invoice PDF shows under the line items (Settings → Invoice settings). Empty = all shown.
alter table public.workspaces add column if not exists invoice_settings jsonb not null default '{}'::jsonb
 check (jsonb_typeof(invoice_settings)='object');
notify pgrst, 'reload schema';
