-- Rhodos Tables — layout editor + approval workflow

-- Zone bounding box for the visual editor
alter table zones
  add column if not exists bbox_x int not null default 20,
  add column if not exists bbox_y int not null default 60,
  add column if not exists bbox_w int not null default 300,
  add column if not exists bbox_h int not null default 360,
  add column if not exists color text;

-- Room (floorplan canvas) + entrance position per restaurant
alter table restaurants
  add column if not exists room_width  int not null default 940,
  add column if not exists room_height int not null default 480,
  add column if not exists entrance_x  int not null default 600,
  add column if not exists entrance_y  int not null default 440,
  add column if not exists entrance_w  int not null default 60,
  add column if not exists entrance_h  int not null default 20;

-- Approval workflow on reservations
alter table reservations
  add column if not exists auto_assigned   boolean not null default false,
  add column if not exists approval_reason text;

-- Refresh seed to populate zone bboxes for new demo data.
create or replace function seed_demo_data(rid uuid)
returns void language plpgsql as $$
declare
  z_innen uuid; z_fenster uuid; z_terrasse uuid;
begin
  update zones set bbox_x =  20, bbox_y = 60, bbox_w = 360, bbox_h = 360
    where restaurant_id = rid and name = 'Innenraum';
  update zones set bbox_x = 400, bbox_y = 60, bbox_w = 180, bbox_h = 360
    where restaurant_id = rid and name = 'Fenster';
  update zones set bbox_x = 600, bbox_y = 60, bbox_w = 300, bbox_h = 360
    where restaurant_id = rid and name = 'Terrasse';

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
