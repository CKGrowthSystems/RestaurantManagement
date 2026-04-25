# Supabase Setup für HostSystem

## Was du in Supabase machen musst

### 1. Projekt anlegen
1. Auf https://supabase.com einloggen → **New project**.
2. Region: Frankfurt (eu-central-1) empfohlen.
3. Database-Passwort setzen (sicher aufbewahren).

### 2. SQL laden
1. **SQL Editor** → **New query**.
2. Inhalt von [`supabase/setup.sql`](./supabase/setup.sql) einfügen → **Run**.
3. Fertig — alle Tabellen, Enums, Trigger, RLS-Policies und das Signup-Auto-Provisioning sind angelegt.

### 3. Authentication konfigurieren
**Authentication → Providers → Email**

- **Enable Email provider** ✅
- **Confirm email** → für Produktion an, zum Testen ggf. aus
- **Secure email change** ✅

**Authentication → URL Configuration**
- **Site URL**: 'http://localhost:3030'
- **Redirect URLs** (eine pro Zeile):
  ```
  http://localhost:3030/auth/callback
  https://app.ckgrowthsystems.com/auth/callback
  ```

### 4. API-Keys abholen
**Settings → API**

- **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
- **anon public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **service_role key** → `SUPABASE_SERVICE_ROLE_KEY` *(nur server-side, niemals im Browser!)*

### 5. `.env.local` im Projekt

> ⚠️ **SECURITY**: Die Werte gehören **ausschließlich** in `.env.local` (ist in `.gitignore`) —
> niemals in Markdown, Git oder irgendwohin, wo sie öffentlich landen. Wer den
> `service_role`-Key hat, umgeht **jede** RLS-Regel und hat Vollzugriff auf die DB.
>
> Keys bereits gesetzt? ✅ — siehe `.env.local` (lokal, nicht eingecheckt).

```bash
NEXT_PUBLIC_SUPABASE_URL=https://PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=…
SUPABASE_SERVICE_ROLE_KEY=…
# Optional: globales Shared Secret für alle Restaurants.
VOICE_WEBHOOK_SECRET=
# Optional: GHL Inbound-Webhook, den wir aufrufen, wenn Reservierungen sich ändern.
GHL_INBOUND_WEBHOOK_URL=
```

Dann `npm run dev` und auf http://localhost:3030/register ein Konto anlegen.

---

## Was die App automatisch macht

Nach dem Signup läuft der Trigger `handle_new_user()`:
1. Erstellt einen neuen Datensatz in `restaurants` (Mandant)
2. Erstellt die `memberships`-Verknüpfung (der User wird **Owner**)
3. Erstellt Default-`settings` (15-Min-Release-Timer, Standard-Öffnungszeiten)
4. Erstellt drei Default-Zonen: *Innenraum*, *Fenster*, *Terrasse*

Der User kann dann unter **Tische** eigene Tische anlegen oder den Demo-Seed ausführen:
```sql
select seed_demo_data('<restaurant-id>'::uuid);
```

---

## Webhook-Integration in GoHighLevel

Alle 4 AI-Endpoints unter `https://DEINE-DOMAIN/api/v1/voice/*`. Authentifizierung via `X-Webhook-Secret` Header (Wert = `restaurants.webhook_secret` aus Supabase, oder globales `VOICE_WEBHOOK_SECRET` aus `.env.local`).

In HostSystem unter **Voice-KI** gibt es einen „Basis-URL + Secret kopieren"-Button.

### `POST /api/v1/voice/availability`
Prüft, ob zu einem Zeitpunkt ein passender Tisch frei ist.
```json
{ "party_size": 4, "starts_at": "2026-04-24T19:30:00+02:00",
  "duration_min": 90, "zone": "Terrasse", "accessible": false }
```

### `POST /api/v1/voice/reservation`
Legt eine Reservierung an, weist automatisch einen Tisch zu. Wenn kein exakter Fit möglich ist (z. B. 2 Personen → nur 4er-Tisch frei), wird sie als `"Offen"` mit `auto_assigned: true` und `approval_reason` gespeichert — der Owner muss im Kanban bestätigen.
```json
{ "guest_name": "Familie Dimitriou", "phone": "+49 171 …",
  "party_size": 4, "starts_at": "2026-04-24T19:30:00+02:00",
  "zone": "Terrasse", "note": "Kinderstuhl",
  "call": { "duration_sec": 154, "transcript": [{ "speaker": "AI", "text": "…" }] } }
```

### `GET /api/v1/voice/hours`
Gibt die Öffnungszeiten zurück (pro Wochentag). Keine Body.

### `POST /api/v1/voice/cancel`
Storniert eine Reservierung. Entweder per ID oder per Telefon+Zeit.
```json
{ "reservation_id": "…" }
// ODER
{ "phone": "+49 171 …", "starts_at": "2026-04-24T19:30:00+02:00" }
```

Die Zuweisungs-Logik ([`lib/assignment.ts`](./lib/assignment.ts)) prüft immer:
- Personenzahl ≤ Tisch-Plätze
- Keine Überschneidung mit bestehenden Reservierungen (±15 Min Puffer)
- Bei Wunsch-Bereich/Barrierefreiheit: Filter greift
- Ranking: engster Fit zuerst, danach Zone, danach Barrierefreiheits-Penalty

---

## Kurz zusammengefasst: Was ich von Supabase benötige

1. ✅ **URL** (`NEXT_PUBLIC_SUPABASE_URL`)
2. ✅ **Anon Key** (`NEXT_PUBLIC_SUPABASE_ANON_KEY`)
3. ✅ **Service-Role Key** (`SUPABASE_SERVICE_ROLE_KEY`)
4. ✅ **`setup.sql` einmalig ausführen**
5. ✅ **Email-Auth aktivieren + Redirect-URLs setzen**

Mehr nicht. Alles andere (Tabellen, Policies, Trigger, Seed) kommt aus dem SQL.
