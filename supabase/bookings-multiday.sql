-- Nexora · multi-day bookings, pricing type, and package snapshots
-- Run in the Supabase SQL editor. Safe to re-run.
-- Listings and packages continue to live in hub_state JSON; this extends the bookings mirror.

-- Ensure the legacy single-day travel date column exists (some projects never had it).
alter table public.bookings add column if not exists date text;

alter table public.bookings add column if not exists start_date text;
alter table public.bookings add column if not exists start_time text;
alter table public.bookings add column if not exists end_date text;
alter table public.bookings add column if not exists end_time text;
alter table public.bookings add column if not exists duration_days integer;
alter table public.bookings add column if not exists duration_nights integer;
alter table public.bookings add column if not exists pricing_type text;
alter table public.bookings add column if not exists package_id text;
alter table public.bookings add column if not exists package_name text;
alter table public.bookings add column if not exists package_price numeric;
alter table public.bookings add column if not exists package_snapshot jsonb;
alter table public.bookings add column if not exists subtotal numeric;

-- Backfill start/end from existing travel-date columns without assuming they are present.
do $$
declare
  has_booking_date boolean;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'bookings' and column_name = 'booking_date'
  ) into has_booking_date;

  -- Prefer legacy `date` when it has a value.
  execute $sql$
    update public.bookings
    set start_date = coalesce(start_date, nullif(date, '')),
        end_date = coalesce(end_date, nullif(date, ''))
    where nullif(date, '') is not null
      and (start_date is null or end_date is null)
  $sql$;

  -- Some older schemas used `booking_date` instead of `date`.
  if has_booking_date then
    execute $sql$
      update public.bookings
      set date = coalesce(nullif(date, ''), booking_date::text),
          start_date = coalesce(start_date, booking_date::text),
          end_date = coalesce(end_date, booking_date::text)
      where booking_date is not null
        and (
          date is null or date = ''
          or start_date is null
          or end_date is null
        )
    $sql$;
  end if;

  -- Keep `date` aligned with start_date for the Worker mirror.
  execute $sql$
    update public.bookings
    set date = coalesce(nullif(date, ''), start_date)
    where (date is null or date = '')
      and nullif(start_date, '') is not null
  $sql$;
end $$;

create index if not exists bookings_start_date_idx on public.bookings (start_date);
create index if not exists bookings_listing_dates_idx on public.bookings (listing_id, start_date, end_date);
