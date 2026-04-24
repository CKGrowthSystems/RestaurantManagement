-- 0008_stammtisch_approval.sql
-- Stammtische und andere „freigabepflichtige" Tische: AutoAssign vergibt die
-- Reservierung nicht direkt als Bestaetigt, sondern als „Angefragt" — der
-- Wirt muss per Klick zustimmen oder ablehnen.
--
-- WICHTIG: In ZWEI getrennten Runs ausfuehren! Postgres erlaubt nicht,
-- ein frisch via ALTER TYPE ADD VALUE angelegtes Enum-Value in derselben
-- Transaction zu verwenden (Fehler 55P04 „unsafe use of new value").
--
-- Idempotent: safe to run multiple times.

-- ============================================================
-- RUN 1 — Enum-Wert „Angefragt" hinzufuegen (muss alleine laufen)
-- ============================================================
alter type reservation_status add value if not exists 'Angefragt' before 'Bestätigt';

-- ============================================================
-- RUN 2 — Rest (Spalten, Index, Kommentare) nach Commit von RUN 1
-- ============================================================
-- Spalten auf tables
alter table if exists tables
  add column if not exists requires_approval boolean not null default false;

alter table if exists tables
  add column if not exists approval_note text;

-- Index fuer schnelle Angefragt-Queries (Dashboard-Badge, Sidebar-Counter)
create index if not exists reservations_angefragt_idx
  on reservations (restaurant_id, status)
  where status = 'Angefragt';

-- Kommentare (Doku auf DB-Ebene)
comment on column tables.requires_approval is
  'Wenn true, gehen vom AutoAssign auf diesen Tisch platzierte Reservierungen auf status=Angefragt statt Bestaetigt. Fuer Stammtische oder VIP-Tische.';
comment on column tables.approval_note is
  'Optionaler Hinweistext, warum dieser Tisch Freigabe braucht. Wird in der Kanban-Karte und im Voice-KI-Fallback angezeigt. Z.B. „Stammtisch Mueller Do 19-22".';
