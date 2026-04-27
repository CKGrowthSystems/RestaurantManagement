-- 0016_db_integrity.sql
-- Datenbank-Hardening fuer Production:
--   1. Buchungsnummer (code) muss UNIQUE pro Restaurant sein — verhindert
--      dass zwei parallele Voice-Calls denselben 5-stelligen Code generieren.
--   2. Helper-Function fuer atomic conflict-check beim Reservation-Insert.
--   3. Index fuer schnelle Slot-Konflikt-Suche.
--
-- Idempotent.

-- ============================================================================
-- 1) Buchungsnummer UNIQUE pro Restaurant
-- ============================================================================
-- Wir nutzen einen partiellen Unique-Index — nur Eintraege MIT Code muessen
-- eindeutig sein (NULL ist erlaubt fuer Walk-Ins / Legacy-Reservierungen).
do $$ begin
  create unique index reservations_code_unique_per_tenant
    on reservations (restaurant_id, code)
    where code is not null;
exception when duplicate_table then null; end $$;

-- ============================================================================
-- 2) Index fuer schnelle Konflikt-Suche bei Tisch-Belegung
-- ============================================================================
-- Voice-AI laeuft check_availability + create_reservation in <1s. Der Conflict-
-- Check sucht alle Reservierungen die im 4h-Fenster um starts_at liegen.
-- Ohne diesen Index waere das ein Full-Table-Scan pro Tenant.
create index if not exists reservations_table_time_idx
  on reservations (restaurant_id, table_id, starts_at)
  where status not in ('Storniert', 'No-Show');

-- ============================================================================
-- 3) Atomic Booking-Code-Generation
-- ============================================================================
-- Stored Function die einen freien 5-stelligen Code findet UND sofort
-- reserviert (per dummy-row mit status='_reserving' falls noetig — oder
-- einfacher: Random-Code, retry-on-conflict via UNIQUE-Index).
--
-- Pragmatisch: wir lassen die UNIQUE-Constraint die Eindeutigkeit erzwingen
-- und retry'en in der App. Diese Funktion ist nicht zwingend noetig —
-- der UNIQUE-Constraint allein reicht.

-- ============================================================================
-- 4) Advisory-Lock fuer Slot-Konflikt-Schutz
-- ============================================================================
-- Function: lock_table_slot — gibt einen Pg-Advisory-Lock fuer
-- (restaurant_id, table_id, starts_at_minute) zurueck. Solange der Lock
-- gehalten wird, kann kein anderer Voice-Call denselben Slot belegen.
-- Aufruf: SELECT lock_table_slot('uuid', 'uuid', '2026-04-26T19:30:00Z');
create or replace function lock_table_slot(
  p_restaurant uuid,
  p_table uuid,
  p_starts_at timestamptz
)
returns boolean
language plpgsql
as $$
declare
  v_key bigint;
begin
  -- Hash der drei Werte zu einem 64-bit Integer fuer pg_try_advisory_xact_lock.
  -- Restaurant-ID + Tisch-ID + Minute-Bucket. Gleiche Inputs → gleicher Hash.
  v_key := abs(hashtext(
    p_restaurant::text || ':' ||
    coalesce(p_table::text, 'null') || ':' ||
    to_char(p_starts_at, 'YYYY-MM-DD-HH24-MI')
  ))::bigint;

  -- pg_try_advisory_xact_lock: gibt true wenn frei, false wenn schon gehalten.
  -- Lock wird automatisch zum Transaction-Ende released.
  return pg_try_advisory_xact_lock(v_key);
end
$$;

comment on function lock_table_slot is
  'Advisory-Lock pro (Restaurant, Tisch, Minute). Verhindert parallele
   Reservierungs-Inserts auf denselben Slot. Lock wird per Transaction
   gehalten und automatisch released.';
