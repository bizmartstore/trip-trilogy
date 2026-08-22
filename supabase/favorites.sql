-- Nexora · fix favourites table to match the Worker (email + listing_id text)
-- Run this in Supabase SQL Editor. Safe to re-run.
--
-- Why: an older schema used (user_id uuid, listing_id uuid). The live app
-- mirrors favourites as (email text, listing_id text). CREATE TABLE IF NOT
-- EXISTS would leave the old columns in place and then fail on indexes.

drop policy if exists "Users manage their own favorites" on public.favorites;

drop table if exists public.favorites;

create table public.favorites (
  email text not null,
  listing_id text not null,
  created_at timestamptz not null default now(),
  primary key (email, listing_id)
);

create index if not exists favorites_email_idx on public.favorites (email);
create index if not exists favorites_created_at_idx on public.favorites (created_at desc);

grant all on public.favorites to service_role;
alter table public.favorites enable row level security;
