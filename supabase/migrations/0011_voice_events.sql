-- 0011_voice_events.sql
-- Strukturiertes Error-/Event-Log fuer Voice-KI:
-- Server-Errors (Validation, DB, Auth), KI-/Tool-Errors (z.B. Stornoanfrage
-- ohne Treffer), und nichttriviale Events landen hier — und werden in der
-- /voice-Seite live angezeigt, damit das Restaurant-Team sofort sieht
-- wenn etwas schiefgelaufen ist.
--
-- Idempotent: safe to run multiple times.

do $$ begin
  create type voice_event_kind as enum ('error', 'warning', 'info');
exception when duplicate_object then null; end $$;

do $$ begin
  create type voice_event_source as enum ('mcp', 'rest', 'agent', 'system');
exception when duplicate_object then null; end $$;

create table if not exists voice_events (
  id              uuid primary key default gen_random_uuid(),
  restaurant_id   uuid not null references restaurants on delete cascade,
  created_at      timestamptz not null default now(),
  kind            voice_event_kind not null default 'error',
  source          voice_event_source not null,
  tool            text,
  message         text not null,
  details         jsonb,
  call_id         uuid references voice_calls on delete set null,
  reservation_id  uuid references reservations on delete set null
);

create index if not exists voice_events_tenant_time_idx
  on voice_events (restaurant_id, created_at desc);
create index if not exists voice_events_kind_idx
  on voice_events (restaurant_id, kind, created_at desc);

alter table voice_events enable row level security;

do $$ begin
  create policy tenant_read on voice_events
    for select using (restaurant_id = current_restaurant_id());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy tenant_write on voice_events
    for all using (restaurant_id = current_restaurant_id())
            with check (restaurant_id = current_restaurant_id());
exception when duplicate_object then null; end $$;

-- Realtime: Live-Updates in der /voice-Seite
do $$ begin
  alter publication supabase_realtime add table voice_events;
exception when duplicate_object then null; end $$;
alter table voice_events replica identity full;

comment on table voice_events is
  'Error- und Event-Log fuer Voice-KI: Server-Errors, KI-/Tool-Errors, Auth-Probleme.
   Wird live in der /voice-Seite angezeigt.';
