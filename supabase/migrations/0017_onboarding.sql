-- 0017_onboarding.sql
-- Setup-Wizard-Tracking. Wenn ein neuer Tenant das System zum ersten Mal
-- oeffnet, leitet die App auf /welcome um — dort wird Restaurant-Profil,
-- Tische, Oeffnungszeiten und Branding in einem Flow eingerichtet.
--
-- Sobald die letzte Wizard-Seite gespeichert ist, setzen wir
-- onboarding_completed_at und leiten in den normalen Dashboard-Flow um.
--
-- Wenn das Feld null ist → Wizard zeigen.
-- Wenn das Feld einen Timestamp hat → Wizard war durch, normal weiter.
--
-- Idempotent.

alter table if exists restaurants
  add column if not exists onboarding_completed_at timestamptz;

comment on column restaurants.onboarding_completed_at is
  'Setzt der Setup-Wizard beim Abschluss. NULL = Tenant wurde noch nicht
   onboarded → /welcome zeigen statt Dashboard.';
