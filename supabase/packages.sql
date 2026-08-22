-- Nexora travel packages catalog (safe to re-run)
-- Source of truth for package details also lives in hub_state.data.packages (Worker JSON).
-- This mirror lets admins query / export tiers from SQL. The app seeds Standard,
-- Premium, and Luxury on first boot and keeps rows in sync when packages are saved.

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
  duration_days integer,
  duration_nights integer,
  pricing_type text not null default 'per_person',
  updated_at timestamptz not null default now()
);

alter table public.travel_packages add column if not exists duration_days integer;
alter table public.travel_packages add column if not exists duration_nights integer;
alter table public.travel_packages add column if not exists pricing_type text;

update public.travel_packages
set pricing_type = 'per_person'
where pricing_type is null or pricing_type = '';

create index if not exists travel_packages_active_idx on public.travel_packages (active);
create index if not exists travel_packages_position_idx on public.travel_packages (position);

grant all on public.travel_packages to service_role;
alter table public.travel_packages enable row level security;

-- Sample / default tiers (editable from the admin Packages tab; not hard-coded in the UI)
insert into public.travel_packages (
  id, name, description, price, inclusions, exclusions, guest_limit, active, position,
  duration_days, duration_nights, pricing_type
) values
(
  'pkg-standard-nexora',
  'Standard',
  'An affordable, complete travel experience with comfortable lodging, shared transfers, and the essential guided activities for first-time visitors.',
  8999,
  '["Twin or triple room accommodation","Daily breakfast","Shared air-conditioned van transfers","Guided island hopping (standard route)","Tour coordinator on standby","Bottled water during tours"]'::jsonb,
  '["Flights and ferry tickets","Personal expenses and souvenirs","Travel insurance","Premium or private activities","Alcoholic beverages"]'::jsonb,
  6,
  true,
  0,
  2,
  1,
  'per_person'
),
(
  'pkg-premium-nexora',
  'Premium',
  'Upgraded rooms, better meals, and additional guided experiences for travellers who want more comfort and inclusion without a fully private itinerary.',
  15999,
  '["Deluxe room upgrade","Breakfast plus one set lunch or dinner daily","Priority shared or semi-private transfers","Extended island and lagoon itinerary","Snorkel gear rental","Welcome drink on arrival","Dedicated trip coordinator"]'::jsonb,
  '["International or domestic flights","Spa treatments and massage","Private yacht or speedboat charter","Travel insurance","Tips and gratuities"]'::jsonb,
  4,
  true,
  1,
  3,
  2,
  'per_person'
),
(
  'pkg-luxury-nexora',
  'Luxury',
  'Premium accommodation, private transportation, personalized concierge service, and exclusive activities for a fully elevated Palawan escape.',
  28999,
  '["Premium suite or private villa night(s)","All meals with private dining options","Private air-conditioned vehicle and driver","Exclusive activities (private lagoon or sunset cruise)","Personal trip host throughout the stay","Airport or pier meet and greet","Priority reservations and flexible timing"]'::jsonb,
  '["International airfare","Shopping and personal purchases","Optional gratuities","Unlisted specialty experiences","Travel insurance (available on request)"]'::jsonb,
  4,
  true,
  2,
  4,
  3,
  'per_person'
)
on conflict (id) do update set
  duration_days = coalesce(public.travel_packages.duration_days, excluded.duration_days),
  duration_nights = coalesce(public.travel_packages.duration_nights, excluded.duration_nights),
  pricing_type = coalesce(nullif(public.travel_packages.pricing_type, ''), excluded.pricing_type);
