-- Rhodos Tables — Räume/Etagen (floors)

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
  created_at    timestamptz not null default now(),
  unique (restaurant_id, name)
);
create index if not exists floors_restaurant_idx on floors (restaurant_id);

-- Zonen bekommen einen Floor
alter table zones
  add column if not exists floor_id uuid references floors on delete cascade;

create index if not exists zones_floor_idx on zones (floor_id);

-- RLS
alter table floors enable row level security;
drop policy if exists tenant_read  on floors;
drop policy if exists tenant_write on floors;
create policy tenant_read  on floors for select using (restaurant_id = current_restaurant_id());
create policy tenant_write on floors for all    using (restaurant_id = current_restaurant_id()) with check (restaurant_id = current_restaurant_id());

-- Backfill: jedes bestehende Restaurant bekommt einen Default-Floor "Erdgeschoss";
-- bestehende Zonen wandern auf diesen Floor.
do $$
declare r record; f uuid;
begin
  for r in select id, room_width, room_height, entrance_x, entrance_y, entrance_w, entrance_h from restaurants loop
    select id into f from floors where restaurant_id = r.id order by sort_order limit 1;
    if f is null then
      insert into floors (restaurant_id, name, sort_order, room_width, room_height, entrance_x, entrance_y, entrance_w, entrance_h)
      values (r.id, 'Erdgeschoss', 0, r.room_width, r.room_height, r.entrance_x, r.entrance_y, r.entrance_w, r.entrance_h)
      returning id into f;
    end if;
    update zones set floor_id = f where restaurant_id = r.id and floor_id is null;
  end loop;
end $$;

-- Trigger aktualisieren: neuer User bekommt Default-Floor + drei Zonen darauf.
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  new_restaurant_id uuid;
  new_floor_id uuid;
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
