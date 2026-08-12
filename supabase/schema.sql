-- ============================================================================
-- Nexora — Tourism Business Marketplace
-- Full schema for Supabase (run in the SQL editor of your project).
-- Order matters: enums -> tables -> grants -> RLS -> policies -> triggers.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- enums ----
create type public.app_role         as enum ('tourist', 'owner', 'admin');
create type public.listing_kind     as enum ('tour', 'stay', 'restaurant');
create type public.business_status  as enum ('pending', 'approved', 'suspended', 'rejected');
create type public.booking_status   as enum ('pending', 'approved', 'confirmed', 'completed', 'cancelled', 'rejected');

-- ------------------------------------------------------------- profiles ----
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  avatar_url  text,
  phone       text,
  country     text,
  created_at  timestamptz not null default now()
);

grant select, insert, update on public.profiles to authenticated;
grant select on public.profiles to anon;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

create policy "Profiles are viewable by everyone"
  on public.profiles for select using (true);
create policy "Users can insert their own profile"
  on public.profiles for insert to authenticated with check (auth.uid() = id);
create policy "Users can update their own profile"
  on public.profiles for update to authenticated using (auth.uid() = id);

-- ------------------------------------------------------------ user_roles ---
-- Roles live in their own table. NEVER store a role on profiles.
create table public.user_roles (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role    public.app_role not null,
  unique (user_id, role)
);

grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles where user_id = _user_id and role = _role
  );
$$;

create policy "Users can read their own roles"
  on public.user_roles for select to authenticated using (auth.uid() = user_id);
create policy "Admins can read all roles"
  on public.user_roles for select to authenticated using (public.has_role(auth.uid(), 'admin'));

-- ------------------------------------------------------------ businesses ---
create table public.businesses (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  slug        text not null unique,
  description text,
  logo_url    text,
  email       text,
  phone       text,
  status      public.business_status not null default 'pending',
  created_at  timestamptz not null default now()
);

grant select, insert, update on public.businesses to authenticated;
grant select on public.businesses to anon;
grant all on public.businesses to service_role;
alter table public.businesses enable row level security;

create policy "Approved businesses are public"
  on public.businesses for select using (status = 'approved');
create policy "Owners can read their own businesses"
  on public.businesses for select to authenticated using (auth.uid() = owner_id);
create policy "Admins can read all businesses"
  on public.businesses for select to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "Owners can create businesses"
  on public.businesses for insert to authenticated with check (auth.uid() = owner_id);
create policy "Owners can update their own businesses"
  on public.businesses for update to authenticated using (auth.uid() = owner_id);
create policy "Admins can update any business"
  on public.businesses for update to authenticated using (public.has_role(auth.uid(), 'admin'));

-- ----------------------------------------------------------- destinations --
create table public.destinations (
  id       uuid primary key default gen_random_uuid(),
  name     text not null,
  country  text not null,
  slug     text not null unique,
  tagline  text,
  image_url text
);

grant select on public.destinations to anon, authenticated;
grant all on public.destinations to service_role;
alter table public.destinations enable row level security;
create policy "Destinations are public" on public.destinations for select using (true);

-- --------------------------------------------------------------- listings --
create table public.listings (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references public.businesses(id) on delete cascade,
  owner_id        uuid not null references auth.users(id) on delete cascade,
  kind            public.listing_kind not null,
  slug            text not null unique,
  title           text not null,
  tagline         text,
  description     text,
  destination     text not null,
  country         text not null,
  category        text,
  price           numeric(10,2) not null check (price >= 0),
  currency        text not null default 'USD',
  unit            text not null default 'person',
  discount_pct    int check (discount_pct between 0 and 90),
  duration_days   int,
  seats_left      int,
  rating          numeric(2,1) not null default 0,
  review_count    int not null default 0,
  images          text[] not null default '{}',
  amenities       text[] not null default '{}',
  tags            text[] not null default '{}',
  inclusions      text[] not null default '{}',
  exclusions      text[] not null default '{}',
  itinerary       jsonb not null default '[]',
  rooms           jsonb not null default '[]',
  menu            jsonb not null default '[]',
  faqs            jsonb not null default '[]',
  cancellation_policy text,
  lat             double precision,
  lng             double precision,
  featured        boolean not null default false,
  status          public.business_status not null default 'pending',
  created_at      timestamptz not null default now()
);

create index listings_kind_idx        on public.listings (kind);
create index listings_destination_idx on public.listings (destination);
create index listings_status_idx      on public.listings (status);
create index listings_tags_idx        on public.listings using gin (tags);

grant select, insert, update, delete on public.listings to authenticated;
grant select on public.listings to anon;
grant all on public.listings to service_role;
alter table public.listings enable row level security;

create policy "Approved listings are public"
  on public.listings for select using (status = 'approved');
create policy "Owners can read their own listings"
  on public.listings for select to authenticated using (auth.uid() = owner_id);
create policy "Admins can read all listings"
  on public.listings for select to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "Owners can create listings"
  on public.listings for insert to authenticated with check (auth.uid() = owner_id);
create policy "Owners can update their own listings"
  on public.listings for update to authenticated using (auth.uid() = owner_id);
create policy "Owners can delete their own listings"
  on public.listings for delete to authenticated using (auth.uid() = owner_id);
create policy "Admins can update any listing"
  on public.listings for update to authenticated using (public.has_role(auth.uid(), 'admin'));

-- --------------------------------------------------------------- bookings --
create table public.bookings (
  id           uuid primary key default gen_random_uuid(),
  reference    text not null unique,
  listing_id   uuid not null references public.listings(id) on delete cascade,
  owner_id     uuid not null references auth.users(id) on delete cascade, -- business owner
  user_id      uuid not null references auth.users(id) on delete cascade, -- tourist
  guests       int not null check (guests > 0),
  booking_date date not null,
  total        numeric(10,2) not null check (total >= 0),
  status       public.booking_status not null default 'pending',
  paid         boolean not null default false,
  notes        text,
  created_at   timestamptz not null default now()
);

create index bookings_user_idx  on public.bookings (user_id);
create index bookings_owner_idx on public.bookings (owner_id);

grant select, insert, update on public.bookings to authenticated;
grant all on public.bookings to service_role;
alter table public.bookings enable row level security;

create policy "Tourists can read their own bookings"
  on public.bookings for select to authenticated using (auth.uid() = user_id);
create policy "Owners can read bookings for their listings"
  on public.bookings for select to authenticated using (auth.uid() = owner_id);
create policy "Admins can read all bookings"
  on public.bookings for select to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "Tourists can create their own bookings"
  on public.bookings for insert to authenticated with check (auth.uid() = user_id);
create policy "Tourists can update their own bookings"
  on public.bookings for update to authenticated using (auth.uid() = user_id);
create policy "Owners can update bookings for their listings"
  on public.bookings for update to authenticated using (auth.uid() = owner_id);
create policy "Admins can update any booking"
  on public.bookings for update to authenticated using (public.has_role(auth.uid(), 'admin'));

-- ---------------------------------------------------------------- reviews --
create table public.reviews (
  id         uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete set null,
  rating     int not null check (rating between 1 and 5),
  body       text not null check (char_length(body) <= 2000),
  created_at timestamptz not null default now(),
  unique (listing_id, user_id)
);

grant select, insert, update, delete on public.reviews to authenticated;
grant select on public.reviews to anon;
grant all on public.reviews to service_role;
alter table public.reviews enable row level security;

create policy "Reviews are public" on public.reviews for select using (true);
create policy "Users can write their own reviews"
  on public.reviews for insert to authenticated with check (auth.uid() = user_id);
create policy "Users can edit their own reviews"
  on public.reviews for update to authenticated using (auth.uid() = user_id);
create policy "Users can delete their own reviews"
  on public.reviews for delete to authenticated using (auth.uid() = user_id);

-- ---------------------------------------------------------------- saved ----
create table public.favorites (
  user_id    uuid not null references auth.users(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);

grant select, insert, delete on public.favorites to authenticated;
grant all on public.favorites to service_role;
alter table public.favorites enable row level security;
create policy "Users manage their own favorites"
  on public.favorites for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- --------------------------------------------------------- notifications ---
create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  title      text not null,
  body       text,
  link       text,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);

grant select, update on public.notifications to authenticated;
grant all on public.notifications to service_role;
alter table public.notifications enable row level security;
create policy "Users read their own notifications"
  on public.notifications for select to authenticated using (auth.uid() = user_id);
create policy "Users mark their notifications read"
  on public.notifications for update to authenticated using (auth.uid() = user_id);

-- ------------------------------------------------------------ trip plans ---
create table public.trip_plans (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text not null,
  destination text not null,
  start_date  date,
  nights      int,
  travellers  int,
  budget      numeric(10,2),
  interests   text[] not null default '{}',
  items       jsonb not null default '[]',
  created_at  timestamptz not null default now()
);

grant select, insert, update, delete on public.trip_plans to authenticated;
grant all on public.trip_plans to service_role;
alter table public.trip_plans enable row level security;
create policy "Users manage their own trip plans"
  on public.trip_plans for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- --------------------------------------------------------------- storage ---
insert into storage.buckets (id, name, public)
values ('listing-images', 'listing-images', true), ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "Public read of listing images"
  on storage.objects for select using (bucket_id in ('listing-images', 'avatars'));
create policy "Authenticated users upload to their own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id in ('listing-images', 'avatars')
    and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "Users update their own files"
  on storage.objects for update to authenticated
  using ((storage.foldername(name))[1] = auth.uid()::text);
create policy "Users delete their own files"
  on storage.objects for delete to authenticated
  using ((storage.foldername(name))[1] = auth.uid()::text);

-- -------------------------------------------------------------- triggers ---
-- Create a profile + default role on signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (new.id, new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'avatar_url');

  insert into public.user_roles (user_id, role)
  values (
    new.id,
    coalesce((new.raw_user_meta_data ->> 'role')::public.app_role, 'tourist')
  )
  on conflict do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep listing rating aggregates in sync with reviews.
create or replace function public.refresh_listing_rating()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid := coalesce(new.listing_id, old.listing_id);
begin
  update public.listings l
  set rating = coalesce((select round(avg(r.rating)::numeric, 1) from public.reviews r where r.listing_id = target), 0),
      review_count = (select count(*) from public.reviews r where r.listing_id = target)
  where l.id = target;
  return null;
end;
$$;

create trigger reviews_refresh_rating
  after insert or update or delete on public.reviews
  for each row execute function public.refresh_listing_rating();
