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
