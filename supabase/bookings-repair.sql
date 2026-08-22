-- Nexora · repair the public.bookings mirror table
-- Run once in the Supabase SQL editor of your project.
--
-- Why: this project still had the ORIGINAL bookings table (owner_id / user_id /
-- booking_date, foreign key to listings, no `customer` or `listing_title`
-- columns). Every reservation mirror therefore failed, so the table stayed
-- empty and guest reservations only lived inside hub_state. This script
-- rebuilds the table in the shape the app writes, so guest and registered
-- reservations are queryable rows again.
--
-- The table is only a mirror of hub_state; dropping it loses nothing.

drop table if exists public.bookings cascade;

create table public.bookings (
  id uuid primary key,
  reference text not null,
  listing_id text not null,
  listing_title text not null default '',
  kind text not null default 'tour',
  image text,
  guests integer not null default 1,
  date text,
  start_date text,
  start_time text,
  end_date text,
  end_time text,
  duration_days integer,
  duration_nights integer,
  pricing_type text,
  package_id text,
  package_name text,
  package_price numeric,
  package_snapshot jsonb,
  subtotal numeric,
  total numeric not null default 0,
  status text not null default 'pending',
  paid boolean not null default false,
  payment_method text,
  paid_at timestamptz,
  customer text not null default '',
  customer_email text,
  customer_phone text,
  notify_preference text default 'call',
  guest_checkout boolean default false,
  status_updated_at timestamptz,
  approved_at timestamptz,
  rejected_at timestamptz,
  status_by text,
  admin_note text,
  created_at timestamptz not null default now()
);

create unique index if not exists bookings_reference_idx on public.bookings (reference);
create index if not exists bookings_status_idx on public.bookings (status);
create index if not exists bookings_created_at_idx on public.bookings (created_at desc);
create index if not exists bookings_customer_email_idx on public.bookings (customer_email);
create index if not exists bookings_start_date_idx on public.bookings (start_date);
create index if not exists bookings_listing_dates_idx on public.bookings (listing_id, start_date, end_date);

-- Server-side (Cloudflare Worker) access only — service role, RLS on, no anon grants.
grant all on public.bookings to service_role;
alter table public.bookings enable row level security;

-- Optional: realtime broadcast for the bookings table (safe to re-run)
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
