# HostSystem — Handoff & ToDo

Stand: nach Sprint G (Commit `2b13262`).

---

## Was Sprint G geliefert hat (heute)

### Bugs behoben
- **Email-Reminder-Cron** existiert jetzt — `/api/admin/email-reminders` läuft täglich 06:45 UTC und schickt Erinnerungen an Gäste mit hinterlegter E-Mail (vorher lief Reminder nur für WhatsApp).
- **Walk-In-Buchungen** spammen das Notification-System nicht mehr (early-return wenn `source === "Walk-In"`).
- **Reschedule** schickt jetzt richtigerweise „Termin verschoben"-Mail statt „Reservierung bestätigt" — sowohl per E-Mail als auch WhatsApp + GHL.
- **Voice-Cancel-Bug** behoben: bei DB-Fehlern sagt die KI nicht mehr „erfolgreich storniert" sondern weist den Gast an, direkt anzurufen.

### DB-Integrität
- Migration `0016_db_integrity.sql`: UNIQUE-Index auf Buchungsnummern + atomic Slot-Lock-Funktion + Konflikt-Index.
- MCP- und REST-Voice-Endpoints: Insert mit Retry-on-Unique-Conflict (parallele Voice-Calls können nicht mehr denselben 5-stelligen Code kollidieren lassen).

### React-Robustheit
- Globale `ErrorBoundary` wrappt jetzt alle App-Seiten — JS-Crashes erzeugen einen sauberen Fallback statt White-Screen.
- Next.js `error.tsx` für SSR-Errors mit „Erneut versuchen"-Button.
- Beide forwarden zu Sentry wenn `SENTRY_DSN` gesetzt ist.

### UX-Verbesserung
- Sidebar-Voice-Badge wird **ROT** wenn voice_events Errors/Warnings in den letzten 24h hat. Restaurant sieht Probleme sofort, muss nicht erst auf /voice navigieren.
- Hover-Tooltip mit Klartext-Hinweis.

### DSGVO
- Cleanup-Cron anonymisiert jetzt voice_calls älter 90 Tage automatisch (Transcript leeren, Phone null, Raw-Payload null) — Statistik bleibt erhalten.

---

## Was DU jetzt tun musst (vor Pilot-Launch)

### 1. Migrations einspielen (Supabase SQL-Editor)

Reihenfolge wichtig — von oben nach unten:

```
0011_voice_events.sql
0012_idempotency_log.sql
0013_rate_limits.sql
0014_whatsapp_config.sql
0015_guest_email_settings.sql
0016_db_integrity.sql
```

Idempotent geschrieben — beliebig oft ausführbar.

### 2. Vercel ENV-Variablen setzen

In Vercel → Project Settings → Environment Variables (Production-Scope):

| Key | Wert | Pflicht |
|---|---|---|
| `CRON_SECRET` | random UUID (z.B. via `uuidgen`) | **PFLICHT** für Crons |
| `RESEND_API_KEY` | `re_...` aus resend.com | für Email-Versand |
| `RESEND_FROM` | `"HostSystem <noreply@deinedomain.de>"` (verifizierte Domain) | für Email-Versand |
| `NEXT_PUBLIC_APP_URL` | `https://restaurant-management-eight-mocha.vercel.app` | für Mail-CTAs |
| `SENTRY_DSN` | `https://...@sentry.io/...` | optional — Error-Forwarding |

Nach Setzen: **Vercel-Deploy neu triggern** damit die ENVs greifen.

### 3. Vercel-Webhook reparieren

Aktuell automatische Deploys aus GitHub gehen nicht durch. Fix:
1. Vercel → Project Settings → **Git**
2. "Disconnect from GitHub" → bestätigen
3. "Connect Git Repository" → Repo `CKGrowthSystems/RestaurantManagement` wieder verbinden
4. Push triggert ab dann wieder automatisch Deploys

### 4. Pilot-Setup beim Rhodos

In dieser Reihenfolge:

1. **Login** mit Rhodos-Owner-Account
2. **Settings → Mein Profil**: Daten checken
3. **Settings → Öffnungszeiten**: aktuelle Zeiten setzen
4. **Settings → Kalender & Inhalte**: Schließtage + Speisekarte-PDF + Allergene-PDF hochladen
5. **Settings → Branding**: Logo + Farben + öffentlicher Name
6. **Settings → Benachrichtigungen**: Team-Email für Bestätigungen + Daily-Digest
7. **Settings → Gast-Benachrichtigungen**:
   - WhatsApp aktivieren → Provider „Demandly" → Webhook-URL aus GHL einfügen (Service-Passwort: `G4b-br44c`)
   - Email aktivieren → Toggles + Texte anpassen
8. **In GHL**: Workflow finalisieren mit 3 Branches (`event = confirmed/cancelled/reminder`) → WhatsApp-Send
9. **Voice-Agent-Prompt** in GHL aktualisieren — alle 8 MCP-Tools nutzen, Channel-Frage-Logik aus `get_restaurant_context.channel_instruction`
10. **End-to-End-Test**: echter Anruf → Buchung → WhatsApp ankommt → Storno-Anruf testen → Reschedule testen

---

## Was als nächstes ansteht (nach Pilot-Validation)

### MUST vor Kunde #2
- **AGB / Datenschutz / AVV** vom Anwalt
- **Pricing-Modell** finalisieren
- **Stripe-Integration** für Subscriptions
- **Landing-Page** + Demo-Video

### Sollte bald kommen (nach Pilot, aber vor Skalierung)
- **Setup-Wizard** für Onboarding neuer Tenants (heute manuell)
- **User-Invite-Flow** für Multi-User-Restaurants (Schema da, UI fehlt)
- **Password-Reset-Flow**
- **DSGVO-UI** für Datenexport/Löschung (Endpoints da, UI fehlt)
- **Audit-Log** für reservation-Änderungen
- **Monitoring**: UptimeRobot auf `/api/health`

### Skalierung (ab 5+ Tenants)
- **Meta Tech-Provider-Antrag** (2-3 Wochen Wartezeit, jetzt schon stellen)
- **WhatsApp Embedded Signup** statt manueller Setup
- **Self-Service-Signup** für neue Restaurants
- **Mobile-Responsive** Floorplan-Editor (heute Desktop/Tablet-zentriert)

---

## Branch-System für andere Branchen (IntakeOS)

Der Design-Prompt für die Service-Branchen-Variante (Tattoo/Beauty/Lash/Barber) liegt unter:

```
/Users/test/Desktop/Restaurant Management/intakeos-design-prompt.md
```

Direkt 1:1 in Claude Design einfügbar (keine Tabellen, alle Listen sauber).

---

## System-Status zusammenfassend

**Was läuft:**
- ✅ Multi-Tenant-Architektur mit RLS
- ✅ Voice-AI-Integration (8 MCP-Tools)
- ✅ Reservierungen, Floorplan, Voice, Analytics, Settings — alle Module
- ✅ WhatsApp + Email an Gäste, editierbare Texte
- ✅ Provider-Switch GHL ↔ Meta Cloud API
- ✅ DSGVO-Endpoints, Consent-Tracking
- ✅ Production-Safety-Net (Sentry, Rate-Limit, Health, Idempotency, Cleanup-Crons)
- ✅ White-Label „Demandly"
- ✅ Error-Boundaries, Voice-Error-Sichtbarkeit im Sidebar

**Was offen ist (in Reihenfolge der Wichtigkeit):**
1. Migrations + ENVs auf Production einspielen
2. Vercel-Webhook reparieren
3. Pilot-Test beim Rhodos durchziehen
4. Stripe-Billing
5. Legal-Docs
6. Marketing-Assets (Landing, Demo-Video)
7. Setup-Wizard für Tenant-Onboarding
8. Self-Service-Signup + Embedded WhatsApp-Signup

**Realistische Timeline zum ersten zahlenden Kunden:** ~2-3 Wochen Solo-Arbeit von dir, parallel zu Pilot-Refinement beim Rhodos.

---

*Letztes Update: nach Sprint G — alle technischen Sub-Bugs aus dem 7-Tage-Audit behoben, System ist pilot-ready.*
