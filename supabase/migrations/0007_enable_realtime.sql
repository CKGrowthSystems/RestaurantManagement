-- 0007_enable_realtime.sql
-- Fuegt die Tenant-Tabellen zur supabase_realtime Publication hinzu, damit der
-- Client Postgres-Changes (INSERT/UPDATE/DELETE) live empfangen kann.
-- Idempotent via DO-Block: Fehler „Tabelle bereits in Publication" wird geschluckt.

do $$ begin alter publication supabase_realtime add table reservations; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table voice_calls;  exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table tables;       exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table zones;        exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table floors;       exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table settings;     exception when duplicate_object then null; end $$;

-- REPLICA IDENTITY FULL, damit DELETE-Events das volle alte Row-Tuple mitsenden
-- (inkl. restaurant_id). Ohne das kommt beim Client-Filter `restaurant_id=eq...`
-- das DELETE-Event nicht an, weil Supabase sonst nur den Primary Key mitsendet.
alter table reservations  replica identity full;
alter table voice_calls   replica identity full;
alter table tables        replica identity full;
alter table zones         replica identity full;
alter table floors        replica identity full;
alter table settings      replica identity full;
