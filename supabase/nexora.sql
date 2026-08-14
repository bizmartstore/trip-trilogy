-- Nexora · run this once in the Supabase SQL editor of your project
-- (https://aeynekfhnzjcimskwouw.supabase.co  →  SQL Editor  →  New query).
-- The app talks to these tables from the Cloudflare Worker with the service
-- role key only, so no anon/authenticated grants are required.

-- 1. Durable application document (listings, bookings, accounts, settings)
create table if not exists public.hub_state (
  id text primary key,
  data jsonb not null,
  revision bigint not null default 1,
  updated_at timestamptz not null default now()
);

grant all on public.hub_state to service_role;
alter table public.hub_state enable row level security;

-- 2. Reservations mirrored as real rows so admins can query / export them
create table if not exists public.bookings (
  id uuid primary key,
  reference text not null,
  listing_id text not null,
  listing_title text not null,
  kind text not null,
  guests integer not null default 1,
  date text not null,
  total numeric not null default 0,
  status text not null default 'pending',
  paid boolean not null default false,
  customer text not null,
  customer_email text,
  created_at timestamptz not null default now()
);

create index if not exists bookings_status_idx on public.bookings (status);
create index if not exists bookings_created_at_idx on public.bookings (created_at desc);
create unique index if not exists bookings_reference_idx on public.bookings (reference);

grant all on public.bookings to service_role;
alter table public.bookings enable row level security;

-- 3. Optional: realtime broadcast for the bookings table (safe to re-run)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'bookings'
  ) then
    alter publication supabase_realtime add table public.bookings;
  end if;
end $$;

-- 4. Approval workflow metadata on bookings (safe to re-run)
alter table public.bookings add column if not exists customer_phone text;
alter table public.bookings add column if not exists notify_preference text default 'call';
alter table public.bookings add column if not exists status_updated_at timestamptz;
alter table public.bookings add column if not exists approved_at timestamptz;
alter table public.bookings add column if not exists rejected_at timestamptz;
alter table public.bookings add column if not exists status_by text;
alter table public.bookings add column if not exists admin_note text;

-- 5. Permanent account registry (every sign-up / Google sign-in lands here)
create table if not exists public.accounts (
  email text primary key,
  name text not null,
  role text not null default 'tourist',
  picture text,
  notify_preference text default 'call',
  contact_number text,
  password_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.accounts add column if not exists password_hash text;

create index if not exists accounts_role_idx on public.accounts (role);

grant all on public.accounts to service_role;
alter table public.accounts enable row level security;

-- Optional one-time cleanup for seeded demo reservations (safe to re-run)
delete from public.bookings
where reference in (
  'EXH-4821-COR',
  'EXH-7710-ELN',
  'EXH-2093-PPS',
  'EXH-5512-ELN',
  'EXH-3388-SVT'
);

-- The main administrator email is always an admin
insert into public.accounts (email, name, role)
values ('sheethappenswithjaa@gmail.com', 'Main Admin', 'admin')
on conflict (email) do update set role = 'admin';

-- One-time cleanup: demote accounts that were incorrectly saved as admin.
-- Invited admins are re-promoted via hub_state.adminInvites on next sign-in.
update public.accounts set role = 'tourist'
where lower(email) <> 'sheethappenswithjaa@gmail.com' and role = 'admin';
