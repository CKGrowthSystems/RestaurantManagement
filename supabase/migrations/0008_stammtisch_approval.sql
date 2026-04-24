-- 0008_stammtisch_approval.sql
-- Stammtische und andere „freigabepflichtige" Tische: AutoAssign vergibt die
-- Reservierung nicht direkt als Bestaetigt, sondern als „Angefragt" — der
-- Wirt muss per Klick zustimmen oder ablehnen.
--
-- Idempotent: safe to run multiple times.

-- 1) Neues Enum-Value „Angefragt" (zwischen Offen und Bestaetigt einsortieren)
do $$ begin
  alter type reservation_status add value if not exists 'Angefragt' before 'Bestätigt';
exception when duplicate_object then null; end $$;

-- 2) Spalten auf tables
alter table if exists tables
  add column if not exists requires_approval boolean not null default false;

alter table if exists tables
  add column if not exists approval_note text;

-- 3) Index fuer schnelle Angefragt-Queries (Dashboard-Badge, Sidebar-Counter)
create index if not exists reservations_angefragt_idx
  on reservations (restaurant_id, status)
  where status = 'Angefragt';

-- 4) Kommentare (Doku auf DB-Ebene)
comment on column tables.requires_approval is
  'Wenn true, gehen vom AutoAssign auf diesen Tisch platzierte Reservierungen auf status=Angefragt statt Bestaetigt. Fuer Stammtische oder VIP-Tische.';
comment on column tables.approval_note is
  'Optionaler Hinweistext, warum dieser Tisch Freigabe braucht. Wird in der Kanban-Karte und im Voice-KI-Fallback angezeigt. Z.B. „Stammtisch Mueller Do 19-22".';
