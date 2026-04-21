-- Rhodos Tables — initial schema
-- Multi-tenant SaaS for restaurant table management with AI voice agent integration.

create extension if not exists pgcrypto;

-- ============================================================================
-- Restaurants (tenants) + membership
-- ============================================================================

create table restaurants (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  slug          text unique not null,
  timezone      text not null default 'Europe/Berlin',
  locale        text not null default 'de-DE',
  theme         text not null default 'default',
  logo_url      text,
  webhook_secret text not null default encode(gen_random_bytes(24), 'hex'),
  created_at    timestamptz not null default now()
);

-- Every auth.users row maps into exactly one restaurant via membership.
create type member_role as enum ('owner', 'manager', 'staff');

create table memberships (
  user_id       uuid not null references auth.users on delete cascade,
  restaurant_id uuid not null references restaurants on delete cascade,
  role          member_role not null default 'manager',
  display_name  text,
  created_at    timestamptz not null default now(),
  primary key (user_id, restaurant_id)
);

create index on memberships (restaurant_id);

-- ============================================================================
-- Zones (Innenraum / Fenster / Terrasse / …)
-- ============================================================================

create table zones (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants on delete cascade,
  name          text not null,
  sort_order    int not null default 0,
  release_minutes int,
  created_at    timestamptz not null default now(),
  unique (restaurant_id, name)
);

create index on zones (restaurant_id);

-- ============================================================================
-- Tables
-- ============================================================================

create type table_shape as enum ('round', 'square');

create table tables (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants on delete cascade,
  zone_id       uuid references zones on delete set null,
  label         text not null,
  seats         int not null check (seats between 1 and 40),
  shape         table_shape not null default 'round',
  accessible    boolean not null default false,
  notes         text,
  pos_x         int not null default 0,
  pos_y         int not null default 0,
  release_minutes int,
  created_at    timestamptz not null default now(),
  unique (restaurant_id, label)
);

create index on tables (restaurant_id);
create index on tables (zone_id);

-- ============================================================================
-- Reservations
-- ============================================================================

create type reservation_source as enum ('Voice-KI', 'Telefon', 'Walk-in', 'Web');
create type reservation_status as enum ('Offen', 'Bestätigt', 'Eingetroffen', 'Abgeschlossen', 'No-Show', 'Storniert');

create table reservations (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants on delete cascade,
  table_id      uuid references tables on delete set null,
  guest_name    text not null,
  phone         text,
  email         text,
  party_size    int not null check (party_size > 0),
  starts_at     timestamptz not null,
  duration_min  int not null default 90 check (duration_min between 15 and 600),
  source        reservation_source not null default 'Web',
  status        reservation_status not null default 'Offen',
  note          text,
  created_by    uuid references auth.users on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index on reservations (restaurant_id, starts_at);
create index on reservations (table_id, starts_at);
create index on reservations (status);

create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger reservations_touch before update on reservations
for each row execute function touch_updated_at();

-- ============================================================================
-- Voice calls (log of every AI conversation)
-- ============================================================================

create type call_outcome as enum ('reservation', 'info', 'declined', 'failed');

create table voice_calls (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants on delete cascade,
  phone         text,
  started_at    timestamptz not null default now(),
  duration_sec  int not null default 0,
  outcome       call_outcome not null default 'info',
  reservation_id uuid references reservations on delete set null,
  transcript    jsonb not null default '[]'::jsonb,
  raw_payload   jsonb
);

create index on voice_calls (restaurant_id, started_at desc);

-- ============================================================================
-- Restaurant settings (release-timer, opening hours)
-- ============================================================================

create type release_mode as enum ('global', 'zone', 'table');

create table settings (
  restaurant_id uuid primary key references restaurants on delete cascade,
  release_mode  release_mode not null default 'global',
  release_minutes int not null default 15 check (release_minutes between 5 and 120),
  opening_hours jsonb not null default '{
    "mo":{"open":"17:00","close":"23:00"},
    "tu":{"open":"17:00","close":"23:00"},
    "we":{"open":"17:00","close":"23:00"},
    "th":{"open":"17:00","close":"23:00"},
    "fr":{"open":"17:00","close":"23:30"},
    "sa":{"open":"12:00","close":"23:30"},
    "su":{"open":"12:00","close":"22:00"}
  }'::jsonb,
  voice_prompt  text
);

-- ============================================================================
-- Webhook audit log (every GHL call landed here)
-- ============================================================================

create table webhook_log (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid references restaurants on delete cascade,
  endpoint      text not null,
  method        text not null,
  status_code   int not null,
  request_body  jsonb,
  response_body jsonb,
  ip            text,
  created_at    timestamptz not null default now()
);

create index on webhook_log (restaurant_id, created_at desc);

-- ============================================================================
-- Helper: current restaurant for the authenticated user
-- ============================================================================

create or replace function current_restaurant_id()
returns uuid language sql stable security definer set search_path = public as $$
  select restaurant_id from memberships
  where user_id = auth.uid()
  order by created_at asc
  limit 1;
$$;

-- ============================================================================
-- Row-level security
-- ============================================================================

alter table restaurants     enable row level security;
alter table memberships     enable row level security;
alter table zones           enable row level security;
alter table tables          enable row level security;
alter table reservations    enable row level security;
alter table voice_calls     enable row level security;
alter table settings        enable row level security;
alter table webhook_log     enable row level security;

-- Memberships: user sees only their own rows.
create policy membership_self on memberships
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Restaurants: readable/updatable by members.
create policy restaurant_member_read on restaurants
  for select using (
    exists (select 1 from memberships m
            where m.restaurant_id = restaurants.id and m.user_id = auth.uid())
  );
create policy restaurant_owner_write on restaurants
  for update using (
    exists (select 1 from memberships m
            where m.restaurant_id = restaurants.id and m.user_id = auth.uid()
              and m.role in ('owner','manager'))
  );

-- Generic tenant-scoped policy helper (applied individually per table)
create policy tenant_read on zones
  for select using (restaurant_id = current_restaurant_id());
create policy tenant_write on zones
  for all using (restaurant_id = current_restaurant_id())
          with check (restaurant_id = current_restaurant_id());

create policy tenant_read on tables
  for select using (restaurant_id = current_restaurant_id());
create policy tenant_write on tables
  for all using (restaurant_id = current_restaurant_id())
          with check (restaurant_id = current_restaurant_id());

create policy tenant_read on reservations
  for select using (restaurant_id = current_restaurant_id());
create policy tenant_write on reservations
  for all using (restaurant_id = current_restaurant_id())
          with check (restaurant_id = current_restaurant_id());

create policy tenant_read on voice_calls
  for select using (restaurant_id = current_restaurant_id());
create policy tenant_write on voice_calls
  for all using (restaurant_id = current_restaurant_id())
          with check (restaurant_id = current_restaurant_id());

create policy tenant_read on settings
  for select using (restaurant_id = current_restaurant_id());
create policy tenant_write on settings
  for all using (restaurant_id = current_restaurant_id())
          with check (restaurant_id = current_restaurant_id());

create policy tenant_read on webhook_log
  for select using (restaurant_id = current_restaurant_id());

-- Webhook endpoints authenticate via service-role key and bypass RLS.

-- ============================================================================
-- Auto-provision on signup: first sign-in creates a restaurant + owner membership
-- ============================================================================

create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  new_restaurant_id uuid;
  restaurant_name text := coalesce(new.raw_user_meta_data->>'restaurant_name', 'Mein Restaurant');
  restaurant_slug text := lower(regexp_replace(
    coalesce(new.raw_user_meta_data->>'restaurant_slug', restaurant_name),
    '[^a-z0-9]+', '-', 'g'
  )) || '-' || substr(new.id::text, 1, 6);
begin
  insert into restaurants (name, slug)
  values (restaurant_name, restaurant_slug)
  returning id into new_restaurant_id;

  insert into memberships (user_id, restaurant_id, role, display_name)
  values (new.id, new_restaurant_id, 'owner',
          coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));

  insert into settings (restaurant_id) values (new_restaurant_id);

  insert into zones (restaurant_id, name, sort_order) values
    (new_restaurant_id, 'Innenraum', 0),
    (new_restaurant_id, 'Fenster', 1),
    (new_restaurant_id, 'Terrasse', 2);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function handle_new_user();
