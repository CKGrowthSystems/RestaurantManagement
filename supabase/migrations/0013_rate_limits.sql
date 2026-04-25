-- 0013_rate_limits.sql
-- Postgres-native Sliding-Window-Rate-Limit. Kein Upstash/Redis noetig —
-- die Voice-Endpoints und der MCP-Server gehen nie durch genug Volumen
-- dass Postgres als Counter ein Bottleneck waere (selbst 100 req/s haelt
-- die DB easy).
--
-- Strategie:
--  - 60s-Buckets pro Schluessel (z.B. "mcp:<restaurant_id>").
--  - Jeder Request inkrementiert atomar (INSERT ON CONFLICT).
--  - Funktion summiert die letzten 2 Buckets (= sliding window ueber 60-120s).
--  - Antwort: allowed BOOL + current_count INT.
--
-- Idempotent: safe to run multiple times.

create table if not exists rate_limit_buckets (
  key            text not null,
  bucket_minute  bigint not null,
  count          int not null default 0,
  primary key (key, bucket_minute)
);

create index if not exists rate_limit_buckets_minute_idx
  on rate_limit_buckets (bucket_minute);

-- Atomic-Counter via Stored Function. Returns:
--   allowed: true wenn Limit noch nicht erreicht
--   current_count: aktueller Count im Sliding-Window
create or replace function incr_rate_limit(
  p_key  text,
  p_max  int
)
returns table (allowed boolean, current_count int)
language plpgsql
as $$
declare
  v_bucket bigint;
  v_count  int;
begin
  v_bucket := floor(extract(epoch from now()) / 60)::bigint;

  -- Upsert: bei Conflict count++ und return den neuen Count
  insert into rate_limit_buckets (key, bucket_minute, count)
    values (p_key, v_bucket, 1)
  on conflict (key, bucket_minute) do update
    set count = rate_limit_buckets.count + 1;

  -- Sliding-Window-Sum: aktuelle + vorherige Minute
  select coalesce(sum(count), 0)::int into v_count
  from rate_limit_buckets
  where key = p_key
    and bucket_minute >= v_bucket - 1;

  return query select (v_count <= p_max), v_count;
end
$$;

-- RLS: nur Service-Role schreibt rein. Tenant-Read brauchen wir nicht.
alter table rate_limit_buckets enable row level security;

comment on function incr_rate_limit is
  'Atomic Sliding-Window-Rate-Limit. Increments und returned ob das Limit
   pro Schluessel innerhalb der letzten 60-120s erreicht ist.';
