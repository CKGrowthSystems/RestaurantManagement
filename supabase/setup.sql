-- ============================================================================
-- RHODOS TABLES · Komplettes Setup-Skript
-- In Supabase → SQL Editor → neues Query → alles reinkopieren → Run
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- Restaurants (Mandanten) + Membership
-- ----------------------------------------------------------------------------
create table if not exists restaurants (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  slug           text unique not null,
  timezone       text not null default 'Europe/Berlin',
  locale         text not null default 'de-DE',
  theme          text not null default 'default',
  logo_url       text,
  webhook_secret text not null default encode(gen_random_bytes(24), 'hex'),
  created_at     timestamptz not null default now()
);

do $$ begin
  create type member_role as enum ('owner', 'manager', 'staff');
exception when duplicate_object then null; end $$;

create table if not exists memberships (
  user_id       uuid not null references auth.users on delete cascade,
  restaurant_id uuid not null references restaurants on delete cascade,
  role          member_role not null default 'manager',
  display_name  text,
  created_at    timestamptz not null default now(),
  primary key (user_id, restaurant_id)
);
create index if not exists memberships_restaurant_idx on memberships (restaurant_id);

-- ----------------------------------------------------------------------------
-- Räume / Etagen (z. B. Erdgeschoss, Obergeschoss)
-- ----------------------------------------------------------------------------
create table if not exists floors (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants on delete cascade,
  name          text not null,
  sort_order    int not null default 0,
  room_width    int not null default 940,
  room_height   int not null default 480,
  entrance_x    int not null default 600,
  entrance_y    int not null default 440,
  entrance_w    int not null default 60,
  entrance_h    int not null default 20,
  room_polygon  jsonb, -- array of {x,y} points; null = rectangle fallback
  created_at    timestamptz not null default now(),
  unique (restaurant_id, name)
);
create index if not exists floors_restaurant_idx on floors (restaurant_id);

-- ----------------------------------------------------------------------------
-- Zonen (Bereiche innerhalb eines Raums)
-- ----------------------------------------------------------------------------
create table if not exists zones (
  id              uuid primary key default gen_random_uuid(),
  restaurant_id   uuid not null references restaurants on delete cascade,
  floor_id        uuid references floors on delete cascade,
  name            text not null,
  sort_order      int not null default 0,
  release_minutes int,
  bbox_x          int not null default 20,
  bbox_y          int not null default 60,
  bbox_w          int not null default 300,
  bbox_h          int not null default 360,
  color           text,
  created_at      timestamptz not null default now(),
  unique (restaurant_id, name)
);
create index if not exists zones_restaurant_idx on zones (restaurant_id);
create index if not exists zones_floor_idx      on zones (floor_id);

-- ----------------------------------------------------------------------------
-- Tische
-- ----------------------------------------------------------------------------
do $$ begin
  create type table_shape as enum ('round', 'square');
exception when duplicate_object then null; end $$;

create table if not exists tables (
  id              uuid primary key default gen_random_uuid(),
  restaurant_id   uuid not null references restaurants on delete cascade,
  zone_id         uuid references zones on delete set null,
  label           text not null,
  seats           int not null check (seats between 1 and 40),
  shape           table_shape not null default 'round',
  accessible      boolean not null default false,
  notes           text,
  pos_x           int not null default 0,
  pos_y           int not null default 0,
  rotation        int not null default 0 check (rotation between -360 and 360),
  release_minutes int,
  created_at      timestamptz not null default now(),
  unique (restaurant_id, label)
);
create index if not exists tables_restaurant_idx on tables (restaurant_id);
create index if not exists tables_zone_idx       on tables (zone_id);

-- ----------------------------------------------------------------------------
-- Reservierungen
-- ----------------------------------------------------------------------------
do $$ begin
  create type reservation_source as enum ('Voice-KI', 'Telefon', 'Walk-in', 'Web');
exception when duplicate_object then null; end $$;

do $$ begin
  create type reservation_status as enum ('Offen', 'Bestätigt', 'Eingetroffen', 'Abgeschlossen', 'No-Show', 'Storniert');
exception when duplicate_object then null; end $$;

create table if not exists reservations (
  id              uuid primary key default gen_random_uuid(),
  restaurant_id   uuid not null references restaurants on delete cascade,
  table_id        uuid references tables on delete set null,
  guest_name      text not null,
  phone           text,
  email           text,
  party_size      int not null check (party_size > 0),
  starts_at       timestamptz not null,
  duration_min    int not null default 90 check (duration_min between 15 and 600),
  source          reservation_source not null default 'Web',
  status          reservation_status not null default 'Offen',
  note            text,
  auto_assigned   boolean not null default false,
  approval_reason text,
  created_by      uuid references auth.users on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists reservations_time_idx   on reservations (restaurant_id, starts_at);
create index if not exists reservations_table_idx  on reservations (table_id, starts_at);
create index if not exists reservations_status_idx on reservations (status);

create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists reservations_touch on reservations;
create trigger reservations_touch before update on reservations
for each row execute function touch_updated_at();

-- ----------------------------------------------------------------------------
-- Voice Calls
-- ----------------------------------------------------------------------------
do $$ begin
  create type call_outcome as enum ('reservation', 'info', 'declined', 'failed');
exception when duplicate_object then null; end $$;

create table if not exists voice_calls (
  id              uuid primary key default gen_random_uuid(),
  restaurant_id   uuid not null references restaurants on delete cascade,
  phone           text,
  started_at      timestamptz not null default now(),
  duration_sec    int not null default 0,
  outcome         call_outcome not null default 'info',
  reservation_id  uuid references reservations on delete set null,
  transcript      jsonb not null default '[]'::jsonb,
  raw_payload     jsonb
);
create index if not exists voice_calls_time_idx on voice_calls (restaurant_id, started_at desc);

-- ----------------------------------------------------------------------------
-- Settings
-- ----------------------------------------------------------------------------
do $$ begin
  create type release_mode as enum ('global', 'zone', 'table');
exception when duplicate_object then null; end $$;

create table if not exists settings (
  restaurant_id   uuid primary key references restaurants on delete cascade,
  release_mode    release_mode not null default 'global',
  release_minutes int not null default 15 check (release_minutes between 5 and 120),
  opening_hours   jsonb not null default '{
    "mo":{"open":"17:00","close":"23:00"},
    "tu":{"open":"17:00","close":"23:00"},
    "we":{"open":"17:00","close":"23:00"},
    "th":{"open":"17:00","close":"23:00"},
    "fr":{"open":"17:00","close":"23:30"},
    "sa":{"open":"12:00","close":"23:30"},
    "su":{"open":"12:00","close":"22:00"}
  }'::jsonb,
  voice_prompt    text,
  branding        jsonb,
  notify          jsonb
);

-- ----------------------------------------------------------------------------
-- Webhook-Audit-Log
-- ----------------------------------------------------------------------------
create table if not exists webhook_log (
  id              uuid primary key default gen_random_uuid(),
  restaurant_id   uuid references restaurants on delete cascade,
  endpoint        text not null,
  method          text not null,
  status_code     int not null,
  request_body    jsonb,
  response_body   jsonb,
  ip              text,
  created_at      timestamptz not null default now()
);
create index if not exists webhook_log_idx on webhook_log (restaurant_id, created_at desc);

-- ----------------------------------------------------------------------------
-- current_restaurant_id() Helper
-- ----------------------------------------------------------------------------
create or replace function current_restaurant_id()
returns uuid language sql stable security definer set search_path = public as $$
  select restaurant_id from memberships
  where user_id = auth.uid()
  order by created_at asc
  limit 1;
$$;

-- ----------------------------------------------------------------------------
-- Row-Level Security
-- ----------------------------------------------------------------------------
alter table restaurants  enable row level security;
alter table memberships  enable row level security;
alter table floors       enable row level security;
alter table zones        enable row level security;
alter table tables       enable row level security;
alter table reservations enable row level security;
alter table voice_calls  enable row level security;
alter table settings     enable row level security;
alter table webhook_log  enable row level security;

drop policy if exists membership_self            on memberships;
drop policy if exists restaurant_member_read     on restaurants;
drop policy if exists restaurant_owner_write     on restaurants;
drop policy if exists tenant_read                on floors;
drop policy if exists tenant_write               on floors;
drop policy if exists tenant_read                on zones;
drop policy if exists tenant_write               on zones;
drop policy if exists tenant_read                on tables;
drop policy if exists tenant_write               on tables;
drop policy if exists tenant_read                on reservations;
drop policy if exists tenant_write               on reservations;
drop policy if exists tenant_read                on voice_calls;
drop policy if exists tenant_write               on voice_calls;
drop policy if exists tenant_read                on settings;
drop policy if exists tenant_write               on settings;
drop policy if exists tenant_read                on webhook_log;

create policy membership_self on memberships
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

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

create policy tenant_read  on floors         for select using (restaurant_id = current_restaurant_id());
create policy tenant_write on floors         for all    using (restaurant_id = current_restaurant_id()) with check (restaurant_id = current_restaurant_id());
create policy tenant_read  on zones          for select using (restaurant_id = current_restaurant_id());
create policy tenant_write on zones          for all    using (restaurant_id = current_restaurant_id()) with check (restaurant_id = current_restaurant_id());
create policy tenant_read  on tables         for select using (restaurant_id = current_restaurant_id());
create policy tenant_write on tables         for all    using (restaurant_id = current_restaurant_id()) with check (restaurant_id = current_restaurant_id());
create policy tenant_read  on reservations   for select using (restaurant_id = current_restaurant_id());
create policy tenant_write on reservations   for all    using (restaurant_id = current_restaurant_id()) with check (restaurant_id = current_restaurant_id());
create policy tenant_read  on voice_calls    for select using (restaurant_id = current_restaurant_id());
create policy tenant_write on voice_calls    for all    using (restaurant_id = current_restaurant_id()) with check (restaurant_id = current_restaurant_id());
create policy tenant_read  on settings       for select using (restaurant_id = current_restaurant_id());
create policy tenant_write on settings       for all    using (restaurant_id = current_restaurant_id()) with check (restaurant_id = current_restaurant_id());
create policy tenant_read  on webhook_log    for select using (restaurant_id = current_restaurant_id());

-- ----------------------------------------------------------------------------
-- Auto-Provisioning bei Signup
-- ----------------------------------------------------------------------------
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  new_restaurant_id uuid;
  new_floor_id      uuid;
  restaurant_name text := coalesce(new.raw_user_meta_data->>'restaurant_name', 'Mein Restaurant');
  restaurant_slug text := lower(regexp_replace(
    coalesce(new.raw_user_meta_data->>'restaurant_slug', restaurant_name),
    '[^a-z0-9]+', '-', 'g'
  )) || '-' || substr(new.id::text, 1, 6);
begin
  insert into restaurants (name, slug) values (restaurant_name, restaurant_slug)
    returning id into new_restaurant_id;

  insert into memberships (user_id, restaurant_id, role, display_name)
    values (new.id, new_restaurant_id, 'owner',
            coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));

  insert into settings (restaurant_id) values (new_restaurant_id);

  insert into floors (restaurant_id, name, sort_order) values (new_restaurant_id, 'Erdgeschoss', 0)
    returning id into new_floor_id;

  insert into zones (restaurant_id, floor_id, name, sort_order, bbox_x, bbox_y, bbox_w, bbox_h) values
    (new_restaurant_id, new_floor_id, 'Innenraum', 0,  20, 60, 360, 360),
    (new_restaurant_id, new_floor_id, 'Fenster',   1, 400, 60, 180, 360),
    (new_restaurant_id, new_floor_id, 'Terrasse',  2, 600, 60, 300, 360);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function handle_new_user();

-- ----------------------------------------------------------------------------
-- Optionaler Demo-Seed: select seed_demo_data('<restaurant-id>'::uuid);
-- ----------------------------------------------------------------------------
create or replace function seed_demo_data(rid uuid)
returns void language plpgsql as $$
declare
  z_innen uuid; z_fenster uuid; z_terrasse uuid;
begin
  select id into z_innen    from zones where restaurant_id = rid and name = 'Innenraum';
  select id into z_fenster  from zones where restaurant_id = rid and name = 'Fenster';
  select id into z_terrasse from zones where restaurant_id = rid and name = 'Terrasse';

  insert into tables (restaurant_id, zone_id, label, seats, shape, accessible, notes, pos_x, pos_y) values
    (rid, z_innen,    'T1', 2, 'round',  false, 'Fensterplatz',     60,  110),
    (rid, z_innen,    'T2', 4, 'round',  false, null,              160,  100),
    (rid, z_innen,    'T3', 2, 'round',  false, null,              270,  110),
    (rid, z_innen,    'T4', 4, 'square', true,  'Rollstuhlgerecht', 60,  220),
    (rid, z_innen,    'T5', 6, 'square', false, null,              170,  220),
    (rid, z_innen,    'T6', 2, 'round',  false, null,              290,  220),
    (rid, z_innen,    'T7', 8, 'square', true,  'Familientisch',   100,  330),
    (rid, z_innen,    'T8', 4, 'round',  false, null,              260,  330),
    (rid, z_fenster,  'F1', 2, 'square', false, null,               90,   90),
    (rid, z_fenster,  'F2', 2, 'square', false, null,               90,  180),
    (rid, z_fenster,  'F3', 4, 'square', false, null,               90,  270),
    (rid, z_terrasse, 'A1', 4, 'round',  false, 'Raucher',          70,   90),
    (rid, z_terrasse, 'A2', 4, 'round',  false, null,              200,   90),
    (rid, z_terrasse, 'A3', 6, 'round',  true,  null,               70,  200),
    (rid, z_terrasse, 'A4', 4, 'round',  false, null,              200,  200),
    (rid, z_terrasse, 'A5', 2, 'square', false, null,               70,  310),
    (rid, z_terrasse, 'A6', 2, 'square', false, null,              200,  310)
  on conflict (restaurant_id, label) do nothing;
end;
$$;
