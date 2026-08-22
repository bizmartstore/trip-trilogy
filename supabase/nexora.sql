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
alter table public.bookings add column if not exists customer_email text;
alter table public.bookings add column if not exists customer_phone text;
alter table public.bookings add column if not exists notify_preference text default 'call';
alter table public.bookings add column if not exists status_updated_at timestamptz;
alter table public.bookings add column if not exists approved_at timestamptz;
alter table public.bookings add column if not exists rejected_at timestamptz;
alter table public.bookings add column if not exists status_by text;
alter table public.bookings add column if not exists admin_note text;

-- 4b. Multi-day schedule, pricing type, and package snapshots (safe to re-run)
-- Prefer running the standalone script: supabase/bookings-multiday.sql
alter table public.bookings add column if not exists date text;alter table public.bookings add column if not exists start_date text;
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

-- 4c. Payment gateway tracking (safe to re-run)
alter table public.bookings add column if not exists payment_method text;
alter table public.bookings add column if not exists paid_at timestamptz;

-- 4e. Guest checkout flag — reservations submitted without a registered account
-- (safe to re-run). Lets the admin console show every unregistered-guest booking.
alter table public.bookings add column if not exists guest_checkout boolean default false;

-- 4d. Normalize reservation emails (safe to re-run) so guest bookings always
-- land in the My Trips of the account registered with the same email.
update public.bookings
set customer_email = lower(trim(customer_email))
where customer_email is not null and customer_email <> lower(trim(customer_email));

do $$
declare
  has_booking_date boolean;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'bookings' and column_name = 'booking_date'
  ) into has_booking_date;

  execute $sql$
    update public.bookings
    set start_date = coalesce(start_date, nullif(date, '')),
        end_date = coalesce(end_date, nullif(date, ''))
    where nullif(date, '') is not null
      and (start_date is null or end_date is null)
  $sql$;

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

  execute $sql$
    update public.bookings
    set date = coalesce(nullif(date, ''), start_date)
    where (date is null or date = '')
      and nullif(start_date, '') is not null
  $sql$;
end $$;

create index if not exists bookings_start_date_idx on public.bookings (start_date);
create index if not exists bookings_listing_dates_idx on public.bookings (listing_id, start_date, end_date);

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

-- 6. Favourites mirrored as real rows (email + listing id text keys used by the Worker)
-- If an older uuid-based favorites table exists, replace it (safe to re-run).
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

-- 7. Listing catalog mirror (availability flags for SQL / admin queries)
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

create index if not exists listing_catalog_available_idx on public.listing_catalog (available);
create index if not exists listing_catalog_kind_idx on public.listing_catalog (kind);

grant all on public.listing_catalog to service_role;
alter table public.listing_catalog enable row level security;

-- 8. Travel packages catalog mirror (Standard / Premium / Luxury + custom tiers)
-- Prefer running the standalone script: supabase/packages.sql
create table if not exists public.travel_packages (
  id text primary key,
  name text not null,
  description text not null default '',
  price numeric not null default 0,
  inclusions jsonb not null default '[]'::jsonb,
  exclusions jsonb not null default '[]'::jsonb,
  guest_limit integer,
  image text,
  active boolean not null default true,
  position integer not null default 0,
  updated_at timestamptz not null default now()
);

create index if not exists travel_packages_active_idx on public.travel_packages (active);
create index if not exists travel_packages_position_idx on public.travel_packages (position);

grant all on public.travel_packages to service_role;
alter table public.travel_packages enable row level security;

insert into public.travel_packages (
  id, name, description, price, inclusions, exclusions, guest_limit, active, position
) values
(
  'pkg-standard-nexora',
  'Standard',
  'An affordable, complete travel experience with comfortable lodging, shared transfers, and the essential guided activities for first-time visitors.',
  8999,
  '["Twin or triple room accommodation","Daily breakfast","Shared air-conditioned van transfers","Guided island hopping (standard route)","Tour coordinator on standby","Bottled water during tours"]'::jsonb,
  '["Flights and ferry tickets","Personal expenses and souvenirs","Travel insurance","Premium or private activities","Alcoholic beverages"]'::jsonb,
  6, true, 0
),
(
  'pkg-premium-nexora',
  'Premium',
  'Upgraded rooms, better meals, and additional guided experiences for travellers who want more comfort and inclusion without a fully private itinerary.',
  15999,
  '["Deluxe room upgrade","Breakfast plus one set lunch or dinner daily","Priority shared or semi-private transfers","Extended island and lagoon itinerary","Snorkel gear rental","Welcome drink on arrival","Dedicated trip coordinator"]'::jsonb,
  '["International or domestic flights","Spa treatments and massage","Private yacht or speedboat charter","Travel insurance","Tips and gratuities"]'::jsonb,
  4, true, 1
),
(
  'pkg-luxury-nexora',
  'Luxury',
  'Premium accommodation, private transportation, personalized concierge service, and exclusive activities for a fully elevated Palawan escape.',
  28999,
  '["Premium suite or private villa night(s)","All meals with private dining options","Private air-conditioned vehicle and driver","Exclusive activities (private lagoon or sunset cruise)","Personal trip host throughout the stay","Airport or pier meet and greet","Priority reservations and flexible timing"]'::jsonb,
  '["International airfare","Shopping and personal purchases","Optional gratuities","Unlisted specialty experiences","Travel insurance (available on request)"]'::jsonb,
  4, true, 2
)
on conflict (id) do nothing;

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
