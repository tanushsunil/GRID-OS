-- "Sign in with GRID": every person has a permanent, unique six-digit GRID number they can sign in with
-- instead of their email and password. It is assigned automatically and never changes.
-- The table has no access policies: it is only reachable through the functions below.
create table public.login_codes(
 user_id uuid primary key references auth.users(id) on delete cascade,
 code char(6) not null unique check (code ~ '^[0-9]{6}$'),
 created_at timestamptz not null default now(),
 last_used_at timestamptz
);
alter table public.login_codes enable row level security;

-- Give an account its number (once). Draws random six-digit numbers until it finds an unused one.
create function public.assign_login_code(uid uuid) returns text language plpgsql security definer set search_path=public as $$
declare candidate text; existing text;
begin
 select code into existing from login_codes where user_id=uid;
 if existing is not null then return existing; end if;
 loop
  candidate:=lpad(floor(random()*1000000)::int::text,6,'0');
  insert into login_codes(user_id,code) values(uid,candidate) on conflict do nothing;
  select code into existing from login_codes where user_id=uid;
  if existing is not null then return existing; end if;
 end loop;
end $$;

-- New accounts get their number as soon as they are created; existing accounts get one now.
create function public.assign_login_code_on_signup() returns trigger language plpgsql security definer set search_path=public as $$
begin perform assign_login_code(new.id); return new; end $$;
create trigger assign_login_code after insert on auth.users for each row execute function public.assign_login_code_on_signup();
select public.assign_login_code(id) from auth.users;

-- The signed-in person's own number (assigned on the spot if somehow missing).
create function public.my_login_code() returns text language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 return assign_login_code(auth.uid());
end $$;

-- Server only: which account a number belongs to (records the use). Never callable with the public key.
create function public.login_code_email(code text) returns text language plpgsql security definer set search_path=public as $$
declare uid uuid; addr text;
begin
 update login_codes set last_used_at=now() where login_codes.code=login_code_email.code returning user_id into uid;
 if uid is null then return null; end if;
 select email into addr from auth.users where id=uid;
 return addr;
end $$;

revoke execute on function public.assign_login_code(uuid),public.assign_login_code_on_signup(),public.my_login_code(),public.login_code_email(text) from public;
grant execute on function public.my_login_code() to authenticated;
do $$ begin
 if exists(select 1 from pg_roles where rolname='anon') then revoke execute on function public.login_code_email(text),public.assign_login_code(uuid) from anon; end if;
 if exists(select 1 from pg_roles where rolname='authenticated') then revoke execute on function public.login_code_email(text),public.assign_login_code(uuid) from authenticated; end if;
 if exists(select 1 from pg_roles where rolname='service_role') then grant execute on function public.login_code_email(text) to service_role; end if;
end $$;
