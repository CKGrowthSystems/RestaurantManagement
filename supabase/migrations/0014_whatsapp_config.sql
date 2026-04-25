-- 0014_whatsapp_config.sql
-- Per-Tenant WhatsApp-Business-Cloud-API-Credentials. Jedes Restaurant
-- verbindet seine EIGENE Meta-Business-Nummer in den Settings — der Gast
-- bekommt die Bestaetigung dann vom Restaurant selbst, nicht von HostSystem.
--
-- Schema-Inhalt von `whatsapp` (jsonb):
-- {
--   "enabled": true,
--   "phone_number_id": "123456789012345",        -- aus Meta Business Manager
--   "access_token": "EAAxxxxx...",               -- System-User-Token (60d) oder Long-lived
--   "business_account_id": "987654321",          -- WABA-ID (optional, fuer Audit)
--   "send_on_confirmed": true,
--   "send_on_cancelled": true,
--   "send_reminder_hours_before": 2,             -- 0 = Reminder aus
--   "templates": {
--     "confirmation": "booking_confirmation_de", -- Name der Meta-approvten Templates
--     "cancellation": "booking_cancellation_de",
--     "reminder": "booking_reminder_de"
--   }
-- }
--
-- Sicherheits-Hinweis: access_token ist sensitiv. RLS schuetzt vor
-- Cross-Tenant-Lesen. Auf API-Seite NIEMALS den Token in Responses
-- zurueckgeben — entfernen vor Marshalling.
--
-- Idempotent.

alter table if exists settings
  add column if not exists whatsapp jsonb;

comment on column settings.whatsapp is
  'Per-Tenant WhatsApp-Cloud-API-Konfiguration. Enthaelt sensitive
   access_token-Daten — niemals in API-Responses zurueckgeben.';

-- Reminder-Tracking: damit wir nicht 2x den selben Reminder schicken,
-- merken wir uns pro Reservierung wann ein Reminder rausging.
alter table if exists reservations
  add column if not exists reminder_sent_at timestamptz;

create index if not exists reservations_reminder_idx
  on reservations (restaurant_id, starts_at)
  where reminder_sent_at is null and status in ('Bestätigt', 'Eingetroffen');

-- DSGVO-Consent fuer WhatsApp-Versand. Voice-KI fragt den Gast „moechten
-- Sie eine WhatsApp-Bestaetigung?" und setzt den Flag entsprechend.
-- Default true ist bewusst pragmatisch fuer den Pilot — wer den Voice-Agent
-- ANRUFT und seine Telefonnummer angibt, hat implizit zugestimmt. Nach
-- Pilot kann der Default auf false migriert werden.
alter table if exists reservations
  add column if not exists whatsapp_consent boolean not null default true;

comment on column reservations.whatsapp_consent is
  'DSGVO-Consent: hat der Gast einer WhatsApp-Bestaetigung zugestimmt?
   Voice-KI fragt explizit. Manuelle Reservierungen koennen den Flag im
   Buchungs-Wizard setzen.';
