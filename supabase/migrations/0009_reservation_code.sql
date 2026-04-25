-- 0009_reservation_code.sql
-- 5-stellige Buchungsnummer pro Reservierung. Voice-freundlich
-- („vier-zwei-sieben-eins-acht"), pro Restaurant unique, einfach
-- auswendig zu nennen wenn der Gast spaeter umbuchen oder stornieren
-- moechte.
--
-- Idempotent: safe to run multiple times.

alter table if exists reservations
  add column if not exists code text;

-- Unique pro Restaurant — derselbe Code in zwei verschiedenen Restaurants
-- ist erlaubt. Partial-Index, weil alte Reservierungen ohne code (NULL)
-- die Constraint nicht treffen sollen.
create unique index if not exists reservations_code_unique
  on reservations (restaurant_id, code)
  where code is not null;

-- Look-up-Index fuer schnelle Cancel-Suche per Code
create index if not exists reservations_code_lookup_idx
  on reservations (restaurant_id, code)
  where code is not null and status <> 'Storniert';

comment on column reservations.code is
  'Voice-freundliche 5-stellige Buchungsnummer pro Restaurant. Voice-KI nennt sie nach erfolgreicher Buchung und akzeptiert sie als primaeres Storno-Identifier.';
