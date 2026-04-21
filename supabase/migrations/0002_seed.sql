-- Seed helper — call with a restaurant_id to populate demo data.
-- Usage: select seed_demo_data('<restaurant-id>'::uuid);

create or replace function seed_demo_data(rid uuid)
returns void language plpgsql as $$
declare
  z_innen uuid; z_fenster uuid; z_terrasse uuid;
begin
  select id into z_innen    from zones where restaurant_id = rid and name = 'Innenraum';
  select id into z_fenster  from zones where restaurant_id = rid and name = 'Fenster';
  select id into z_terrasse from zones where restaurant_id = rid and name = 'Terrasse';

  insert into tables (restaurant_id, zone_id, label, seats, shape, accessible, notes, pos_x, pos_y) values
    (rid, z_innen,    'T1', 2, 'round',  false, 'Fensterplatz',  60,  110),
    (rid, z_innen,    'T2', 4, 'round',  false, null,           160,  100),
    (rid, z_innen,    'T3', 2, 'round',  false, null,           270,  110),
    (rid, z_innen,    'T4', 4, 'square', true,  'Rollstuhlgerecht', 60, 220),
    (rid, z_innen,    'T5', 6, 'square', false, null,           170,  220),
    (rid, z_innen,    'T6', 2, 'round',  false, null,           290,  220),
    (rid, z_innen,    'T7', 8, 'square', true,  'Familientisch', 100, 330),
    (rid, z_innen,    'T8', 4, 'round',  false, null,           260,  330),
    (rid, z_fenster,  'F1', 2, 'square', false, null,            90,   90),
    (rid, z_fenster,  'F2', 2, 'square', false, null,            90,  180),
    (rid, z_fenster,  'F3', 4, 'square', false, null,            90,  270),
    (rid, z_terrasse, 'A1', 4, 'round',  false, 'Raucher',       70,   90),
    (rid, z_terrasse, 'A2', 4, 'round',  false, null,           200,   90),
    (rid, z_terrasse, 'A3', 6, 'round',  true,  null,            70,  200),
    (rid, z_terrasse, 'A4', 4, 'round',  false, null,           200,  200),
    (rid, z_terrasse, 'A5', 2, 'square', false, null,            70,  310),
    (rid, z_terrasse, 'A6', 2, 'square', false, null,           200,  310)
  on conflict (restaurant_id, label) do nothing;
end;
$$;
