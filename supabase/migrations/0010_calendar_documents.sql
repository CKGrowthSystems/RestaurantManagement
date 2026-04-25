-- 0010_calendar_documents.sql
-- Zentrales Calendar-Feld in settings: Schliesstage, Sondertage, Ankuendigungen,
-- Policies, Speisekarten- + Allergen-PDFs (mit extrahiertem Text fuer KI-Lookup).
--
-- Idempotent: safe to run multiple times.

alter table if exists settings
  add column if not exists calendar jsonb not null default '{}'::jsonb;

comment on column settings.calendar is
  'Strukturiertes JSON fuer Voice-KI-Kontext: closures (Urlaub), special_hours (Sondertage),
   announcements (Ankuendigungen), menu (PDF + extracted_text), allergens (PDF + extracted_text),
   policies (Allergien/Kinder/Gruppen-Hinweise), menu_highlights (max 5 Bullet-Points).
   Wird via MCP-Tool get_restaurant_context an die KI ausgeliefert.';
