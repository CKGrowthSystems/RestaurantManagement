# Projekt-Kontext

**Produkt:** HostSystem
**Anbieter:** CK GrowthSystems
**Erster Kunde / Pilot:** Restaurant Rhodos Ohlsbach

Das ist die SaaS-Plattform „HostSystem" von CK GrowthSystems — ein Multi-Tenant-Restaurant-Management-System mit Voice-KI-Telefonbuchung,
Live-Tischplan, Reservierungs-Kanban und MCP-basierter Anbindung an
GoHighLevel-Voice-Agents.

## Architektur in 30 Sekunden

- **Frontend / Backend:** Next.js 15.5 (App Router) auf Vercel, React 19, TypeScript
- **DB / Auth / Realtime:** Supabase (Postgres + RLS + Realtime CDC + Auth)
- **Voice-KI:** GoHighLevel Voice Agent → MCP-Server (`/api/mcp`) → Supabase
- **Multi-Tenancy:** ein Server, ein Code, pro Restaurant ein `restaurants.webhook_secret` und eine `restaurant_id`. RLS + App-Layer-Filter auf jedem Query.
- **Onboarding neuer Kunden:** Supabase Auth-User anlegen → Trigger
  `handle_new_user()` provisioniert automatisch Restaurant + Owner-Membership + Default-Settings + Default-Raum + 3 Default-Zonen.

## Status (Stand 25. April 2026)

- ✅ MCP-Server bulletproof (5 Tools, Berlin-TZ-korrekt, 5s Pacing)
- ✅ Realtime über Supabase CDC (Reservierungen, Voice-Calls, Sidebar-Badges)
- ✅ Floorplan mit Pixel-Canvas, Zone-Polygon, Tisch-Rotation
- ✅ Stammtisch-Feature (`requires_approval` + Status `Angefragt`)
- ✅ Walk-In als Quick-Action (ohne Name/Telefon)
- ✅ Multi-Tenancy auditiert
- ✅ DSGVO-konformer Voice-Agent (sagt JA wenn nach KI gefragt)

## Was vor Marketing-Launch noch fehlt

Siehe Phasen-Plan in der Konversation 2026-04-25:
- **Phase 1 (Hard-Blocker):** Rate-Limit, Sentry, DSGVO-Pflichtseiten, Live-Testanruf, Email-Versand, Health-Check, Uptime-Monitor
- **Phase 2 (Vor-Launch):** Onboarding-Wizard, Mobile-Responsive, Webhook-Secret-Hashing, Idempotency, Voice-Clone-Setup
- **Phase 3 (Marketing-ready):** Landing-Page, Stripe + Pricing-Tiers, Custom-Subdomains, Whitelabel-komplett, Super-Admin-Panel

## Branding-Implikationen

- **Sichtbarer Markenname:** „HostSystem" (Produkt). „Rhodos" ist nur der erste Pilotkunde — das alte Repo-Working-Title „Rhodos Tables" ist deprecated.
- **Anbieter:** CK GrowthSystems
- Das `EditableWordmark` in der Sidebar zeigt den Restaurant-Namen des Kunden, NICHT den Produktnamen
- Email-Sender-Name, Footer, Impressum, AGB → CK GrowthSystems
- Whitelabel-Konzept: Kunden können eigene Logos / Farben / Sender-Namen einstellen

## Code-Konventionen

- **Sprache:** UI ist Deutsch (Sie-Form)
- **Datums-Format:** `Europe/Berlin` immer explizit setzen (Vercel läuft in UTC)
- **Source-Labels:** Nur drei kanonische Werte für neue Records:
  `"Voice-KI"`, `"Webseite"`, `"Manuell"` (alte Werte Telefon/Web/Walk-in werden auf Anzeige-Ebene normalisiert)
- **Status-Labels:** `Angefragt → Bestätigt → Eingetroffen → Abgeschlossen`. Nie wieder `Offen` für neue Records (deprecated)
- **Migrations:** numerisch in `supabase/migrations/`. Aktuell bis 0008.

## Wichtige Pfade

- `app/api/mcp/route.ts` — MCP-Server, das Herzstück der Voice-KI-Integration
- `lib/assignment.ts` — AutoAssign-Logik mit Stammtisch-Approval
- `lib/date-parsing.ts` — bulletproofe Datumsparsung mit DST-Handling
- `lib/supabase/realtime.ts` — `useRealtimeList`/`useRealtimeCount` Hooks
- `components/shell.tsx` — Sidebar (collapsible) + Topbar
- `app/(app)/floorplan/floorplan-client.tsx` — Pixel-Canvas-Planeditor
- `app/(app)/reservations/kanban.tsx` — Kanban mit Approval-UI

## Repository

- GitHub: `CKGrowthSystems/RestaurantManagement`
- Vercel: `restaurant-management-eight-mocha.vercel.app`
- Supabase Project ID: `ewdevkxvapytpxjuklih`
