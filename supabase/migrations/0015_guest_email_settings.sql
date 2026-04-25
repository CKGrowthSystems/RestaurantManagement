-- 0015_guest_email_settings.sql
-- Email-an-GAST Konfiguration. Komplett separat von notify.email das ans
-- Team geht — guest_email regelt Bestaetigungs-Mails an den Reservierenden.
--
-- Struktur (jsonb):
-- {
--   "enabled": true,
--   "send_on_confirmed": true,
--   "send_on_cancelled": true,
--   "send_reminder_hours_before": 24,
--   "custom_messages": {
--     "confirmed_greeting": "Hallo {name}, ...",
--     "confirmed_closing": "Wir freuen uns ...",
--     ...
--   }
-- }
--
-- Idempotent.

alter table if exists settings
  add column if not exists guest_email jsonb;

comment on column settings.guest_email is
  'Email-an-Gast-Konfiguration (Bestaetigung/Storno/Reminder).
   Separat von notify.email das nur fuer Team-interne Alerts ist.';
