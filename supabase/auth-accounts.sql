-- Additive patch for existing ExploreHub Supabase projects.
-- Run this in the SQL editor if schema.sql was already applied.
-- Lets sign-up / sign-in persist in auth.users + public.profiles across devices.

alter table public.profiles add column if not exists email text;
create unique index if not exists profiles_email_idx on public.profiles (email)
  where email is not null;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  assigned public.app_role;
begin
  insert into public.profiles (id, full_name, avatar_url, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture'),
    new.email
  )
  on conflict (id) do update
    set full_name = coalesce(excluded.full_name, public.profiles.full_name),
        avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url),
        email = coalesce(excluded.email, public.profiles.email);

  assigned := case
    when lower(new.email) = 'sheethappenswithjaa@gmail.com' then 'admin'::public.app_role
    else 'tourist'::public.app_role
  end;

  insert into public.user_roles (user_id, role)
  values (new.id, assigned)
  on conflict do nothing;

  return new;
end;
$$;

-- Backfill emails for any existing auth users.
update public.profiles p
set email = u.email
from auth.users u
where p.id = u.id
  and (p.email is null or p.email = '');
