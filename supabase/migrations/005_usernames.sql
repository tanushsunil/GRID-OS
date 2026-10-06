-- Login IDs: each person gets a unique, lowercase username alongside their email (email stays for password resets).
alter table public.profiles add column username text;
alter table public.profiles add constraint profiles_username_format check (username is null or username ~ '^[a-z0-9][a-z0-9._-]{1,28}[a-z0-9]$');
create unique index profiles_username_key on public.profiles(username);

-- Create the profile as soon as an account exists, carrying the login ID chosen at sign-up.
create function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
declare handle text:=lower(nullif(trim(new.raw_user_meta_data->>'username'),''));
begin
 insert into profiles(id,email,name,username) values(new.id,coalesce(new.email,''),left(coalesce(nullif(new.raw_user_meta_data->>'name',''),split_part(coalesce(new.email,''),'@',1)),100),handle)
 on conflict(id) do update set username=coalesce(profiles.username,excluded.username);
 return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Resolves a login ID to the account email for sign-in. Server-only: never callable with the public key,
-- so nobody can look up someone's email from their login ID.
create function public.login_email(login_id text) returns text language sql stable security definer set search_path=public as $$
 select u.email from profiles p join auth.users u on u.id=p.id where p.username=lower(trim(login_id)) limit 1
$$;
revoke execute on function public.login_email(text) from public;
do $$ begin
 if exists(select 1 from pg_roles where rolname='anon') then revoke execute on function public.login_email(text) from anon; end if;
 if exists(select 1 from pg_roles where rolname='authenticated') then revoke execute on function public.login_email(text) from authenticated; end if;
 if exists(select 1 from pg_roles where rolname='service_role') then grant execute on function public.login_email(text) to service_role; end if;
end $$;
