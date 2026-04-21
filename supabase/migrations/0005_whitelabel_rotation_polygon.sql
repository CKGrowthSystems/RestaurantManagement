-- 0005_whitelabel_rotation_polygon.sql
-- Adds branding + notify to settings, rotation to tables, polygon to floors.
-- Idempotent: safe to run multiple times.

alter table if exists settings
  add column if not exists branding jsonb,
  add column if not exists notify   jsonb;

alter table if exists tables
  add column if not exists rotation int not null default 0;

alter table if exists floors
  add column if not exists room_polygon jsonb; -- array of {x,y} points; null = rectangle fallback

-- Drop accidental legacy index if present (no-op otherwise)
do $$ begin
  if not exists (select 1 from pg_indexes where indexname = 'settings_restaurant_id_key') then
    create unique index settings_restaurant_id_key on settings (restaurant_id);
  end if;
end $$;
