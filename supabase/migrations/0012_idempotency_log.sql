-- 0012_idempotency_log.sql
-- HTTP-Idempotency fuer Voice-Endpoints. Wenn der Voice-Agent denselben
-- POST mit demselben `Idempotency-Key`-Header zweimal sendet (z.B. nach
-- Netzwerk-Retry), bekommt er beim zweiten Mal die GECACHTE Antwort
-- statt eine zweite Reservierung anzulegen.
--
-- Cache-TTL via Cleanup-Cron: Eintraege > 24h werden geloescht. Damit
-- ein Replay nach Tagen NICHT mehr greift (Sicherheit vs. Storno).
--
-- Idempotent: safe to run multiple times.

create table if not exists idempotency_log (
  -- key ist client-seitig generierte UUID. Eindeutig PRO RESTAURANT damit
  -- ein Tenant nicht durch Key-Erraten in einen anderen reinschreiben kann.
  key            text not null,
  restaurant_id  uuid not null references restaurants on delete cascade,
  endpoint       text not null,
  status_code    int not null,
  response       jsonb not null,
  created_at     timestamptz not null default now(),
  primary key (restaurant_id, key)
);

create index if not exists idempotency_log_created_idx
  on idempotency_log (created_at);

alter table idempotency_log enable row level security;

-- Webhooks/MCP nutzen Service-Role und umgehen RLS — wir brauchen aber
-- trotzdem Tenant-Read fuer evtl. Admin-Uebersicht.
do $$ begin
  create policy tenant_read on idempotency_log
    for select using (restaurant_id = current_restaurant_id());
exception when duplicate_object then null; end $$;

comment on table idempotency_log is
  'HTTP-Idempotency-Keys fuer Voice-Webhooks. Verhindert doppelte
   Reservierungen bei Netzwerk-Retries. Cleanup nach 24h via Cron.';
