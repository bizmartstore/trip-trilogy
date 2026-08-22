-- Nexora · listing_catalog mirror (availability + core fields)
-- Run once in Supabase SQL Editor. Safe to re-run.
-- Full listing content still lives in hub_state; this table is for admin queries.
-- Named listing_catalog to avoid clashing with any legacy public.listings table.

create table if not exists public.listing_catalog (
  id text primary key,
  slug text not null,
  kind text not null,
  title text not null,
  destination text,
  status text not null default 'approved',
  available boolean not null default true,
  unavailable_reason text,
  updated_at timestamptz not null default now()
);

alter table public.listing_catalog add column if not exists destination text;
alter table public.listing_catalog add column if not exists status text;
alter table public.listing_catalog add column if not exists available boolean;
alter table public.listing_catalog add column if not exists unavailable_reason text;
alter table public.listing_catalog add column if not exists updated_at timestamptz;

alter table public.listing_catalog alter column available set default true;

create index if not exists listing_catalog_available_idx on public.listing_catalog (available);
create index if not exists listing_catalog_kind_idx on public.listing_catalog (kind);

grant all on public.listing_catalog to service_role;
alter table public.listing_catalog enable row level security;
