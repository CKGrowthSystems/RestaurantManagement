/**
 * MCP (Model Context Protocol) Server Endpoint — BULLETPROOF VERSION
 * =================================================================
 *
 * Hardened against:
 *  - Hallucinated dates (LLM invents wrong year/weekday)
 *  - Missing time zone
 *  - Past dates
 *  - Bookings outside opening hours
 *  - Empty tool pings
 *  - Missing required parameters
 *  - Duplicate reservations for same phone + same slot
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { authenticateWebhook } from "@/lib/voice-auth";
import { logVoiceEventAsync } from "@/lib/voice-events";
import { rankCandidates, autoAssign } from "@/lib/assignment";
import { parseStartsAt, currentDateTimeInfo } from "@/lib/date-parsing";
import { phonesMatch } from "@/lib/phone";
import { generateUniqueBookingCode } from "@/lib/booking-code";
import { normalizeOpeningSlots, isOpenAt, formatSlotsHuman, type OpeningSlot } from "@/lib/opening-hours";
import {
  isClosureForDate, getSpecialHoursForDate, getActiveAnnouncements, getUpcomingClosures,
  getDocumentText, todayBerlinISO, dateToBerlinISO,
  type CalendarData,
} from "@/lib/calendar";
import type { Reservation, TableRow, Zone } from "@/lib/types";

export const runtime = "nodejs";

const TOOLS = [
  {
    name: "get_current_date_time",
    description:
      "PFLICHT-ZUERST. Rufe dieses Tool IMMER als Allererstes auf, sobald ein Gast eine Reservierung oder einen Termin erwähnt, BEVOR du check_availability aufrufst. Liefert das heutige Datum in Europe/Berlin damit du 'heute', 'morgen' und Wochentage korrekt in ein konkretes Datum umrechnen kannst.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "check_availability",
    description:
      "Prüft, ob zur gewünschten Uhrzeit für die gewünschte Personenzahl ein Tisch frei ist. Rufe das Tool IMMER auf, bevor du dem Gast eine Verfügbarkeit bestätigst. Akzeptiert sowohl ISO-Datum mit Zeitzone (z. B. '2026-04-23T20:00:00+02:00') als auch natürliche Angaben ('heute 20 Uhr', 'morgen 19:30', 'Donnerstag 19:00'). Gibt 'instruction' zurück — Klartext (BESTAETIGEN / ABSAGEN / NACHFRAGEN) den du 1:1 befolgen musst.",
    inputSchema: {
      type: "object",
      properties: {
        party_size: { type: "integer", minimum: 1, maximum: 40, description: "Anzahl der Gäste." },
        starts_at: { type: "string", description: "Reservierungszeitpunkt. Bevorzugt ISO-8601 mit +02:00, z. B. '2026-04-23T20:00:00+02:00'. Natürliche Angaben wie 'morgen 20 Uhr' werden ebenfalls akzeptiert." },
        duration_min: { type: "integer", default: 90 },
        zone: { type: "string", enum: ["Innenraum", "Fenster", "Terrasse"] },
        accessible: { type: "boolean" },
      },
      required: ["party_size", "starts_at"],
    },
  },
  {
    name: "create_reservation",
    description:
      "Legt eine Reservierung an. NUR aufrufen, nachdem check_availability erfolgreich war (available=true) UND Name/Telefonnummer vom Gast bestätigt sind. Jede erfolgreiche Buchung wird automatisch als 'Bestätigt' angelegt. Gibt 'instruction' zurück (FERTIG / ABSAGEN).",
    inputSchema: {
      type: "object",
      properties: {
        guest_name: { type: "string" },
        phone: { type: "string" },
        email: { type: "string" },
        party_size: { type: "integer", minimum: 1, maximum: 40 },
        starts_at: { type: "string" },
        duration_min: { type: "integer", default: 90 },
        zone: { type: "string", enum: ["Innenraum", "Fenster", "Terrasse"] },
        accessible: { type: "boolean" },
        note: { type: "string" },
      },
      required: ["guest_name", "party_size", "starts_at", "phone"],
    },
  },
  {
    name: "get_opening_hours",
    description: "Gibt die Öffnungszeiten pro Wochentag zurück. Für Fragen wie 'wann habt ihr auf?'.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_restaurant_context",
    description:
      "PFLICHT zu Beginn jedes Anrufs (direkt nach get_current_date_time). Liefert Echtzeit-Kontext: ob heute geschlossen ist (Urlaub/Feiertag), ob Sonderöffnungszeiten gelten, aktuelle Ankündigungen, ob Speisekarte/Allergene zur Verfügung stehen, Hinweis-Texte zu Allergien/Kindern/Gruppen. Damit weiß die KI sofort was sie sagen darf und welche weiteren Tools verfügbar sind.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "lookup_menu",
    description:
      "Sucht im hochgeladenen Speisekarten- bzw. Allergen-Text nach einem Begriff (z.B. 'vegetarisch', 'glutenfrei', 'Nüsse', 'Tagesgericht', 'Wein'). Liefert relevante Snippets zurück. Nutze diesen Tool wenn der Gast nach Speisen, Diäten, Allergenen oder Sonderwünschen fragt. NIEMALS Inhalte erfinden — nur was als Snippet zurückkommt.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Suchbegriff (z.B. 'vegetarisch', 'Nüsse', 'Wein')." },
        source: { type: "string", enum: ["menu", "allergens", "both"], description: "Wo gesucht werden soll. Default 'both'." },
      },
      required: ["query"],
    },
  },
  {
    name: "cancel_reservation",
    description:
      "Storniert eine bestehende Reservierung. ABLAUF: Frag den Gast ZUERST nach der 5-stelligen BUCHUNGSNUMMER (`code`) — die hat er beim Buchen bekommen. Wenn er sie nicht hat, frag nach NAMEN UND TELEFONNUMMER und ursprünglichem Datum/Uhrzeit. Bei mehreren Treffern bekommst du eine NACHFRAGEN-Instruction mit Optionen.",
    inputSchema: {
      type: "object",
      properties: {
        code: { type: "string", description: "5-stellige Buchungsnummer (z.B. 42718). Wenn der Gast sie kennt, IMMER zuerst hierueber suchen — am eindeutigsten und schnellsten." },
        reservation_id: { type: "string", description: "Direkte UUID, falls bekannt." },
        guest_name: { type: "string", description: "Name des Gastes (Vor- oder Nachname reicht für unscharfe Suche)." },
        phone: { type: "string", description: "Telefonnummer — Format egal (mit/ohne +49, mit/ohne Leerzeichen)." },
        starts_at: { type: "string", description: "Datum + Uhrzeit als ISO-8601 mit Zeitzone (z. B. 2026-04-25T21:00:00+02:00) oder natürliche Angabe ('heute 21 Uhr', 'morgen 19:30')." },
      },
    },
  },
];

function rpcResult(id: number | string | null, result: unknown) {
  return { jsonrpc: "2.0", id, result };
}
function rpcError(id: number | string | null, code: number, message: string) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}
function textContent(obj: unknown) {
  return {
    content: [{ type: "text", text: typeof obj === "string" ? obj : JSON.stringify(obj, null, 2) }],
    structuredContent: typeof obj === "object" && obj !== null ? obj : undefined,
  };
}

/** Is the given ISO timestamp within opening hours for that weekday, evaluated in Europe/Berlin? */
function isWithinOpeningHours(
  d: Date,
  openingHours: Record<string, unknown> | null,
): { inside: boolean; weekday: string; dayKey: string; hh: number; mm: number; slots: OpeningSlot[] } | null {
  if (!openingHours) return null;
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin",
    weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const parts = fmt.formatToParts(d);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hh = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const mm = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const wdMap: Record<string, string> = { Sun: "su", Mon: "mo", Tue: "tu", Wed: "we", Thu: "th", Fri: "fr", Sat: "sa" };
  const dayKey = wdMap[weekday] ?? "";
  const slots = normalizeOpeningSlots(openingHours[dayKey]);
  if (slots.length === 0) return { inside: false, weekday, dayKey, hh, mm, slots: [] };
  return { inside: isOpenAt(slots, hh, mm), weekday, dayKey, hh, mm, slots };
}

async function callTool(name: string, rawArgs: unknown, restaurantId: string) {
  const args = (rawArgs && typeof rawArgs === "object" ? rawArgs : {}) as Record<string, unknown>;
  const admin = createAdminClient();

  // ==================================================================
  // 1) get_current_date_time
  // ==================================================================
  if (name === "get_current_date_time") {
    return textContent({
      ...currentDateTimeInfo(),
      instruction:
        "Nutze 'today_date' (YYYY-MM-DD) als Basis. Wenn der Gast 'heute' sagt, verwende dieses Datum. Für 'morgen' +1 Tag. Für Wochentage: errechne das nächste Vorkommen dieses Wochentags. Sende dann starts_at immer als ISO mit Zeitzone +02:00 (oder +01:00 im Winter) an check_availability.",
    });
  }

  // ==================================================================
  // 2) check_availability
  // ==================================================================
  if (name === "check_availability") {
    const party = Number(args.party_size);
    const startsRaw = args.starts_at as string | undefined;
    const durationMin = Number(args.duration_min ?? 90);

    if (!Number.isFinite(party) || party <= 0) {
      return textContent({
        available: false,
        instruction: "NACHFRAGEN: Die Personenzahl fehlt. Frage den Gast: 'Für wie viele Personen?' und rufe check_availability dann erneut auf.",
      });
    }
    if (!startsRaw) {
      return textContent({
        available: false,
        instruction: "NACHFRAGEN: Datum und Uhrzeit fehlen. Frage den Gast nach dem gewünschten Tag und der Uhrzeit.",
      });
    }

    const parsed = parseStartsAt(startsRaw);
    if (!parsed.ok || !parsed.iso) {
      return textContent({
        available: false,
        instruction: `NACHFRAGEN: Ich konnte Datum und Uhrzeit nicht eindeutig verstehen (${parsed.error}). Bitte frage den Gast nochmal konkret nach Tag und Uhrzeit, z. B. 'Donnerstag, 20 Uhr'.`,
      });
    }
    const startsAt = new Date(parsed.iso);
    const dateISO = dateToBerlinISO(startsAt);

    // Settings + Calendar
    const { data: settings } = await admin.from("settings")
      .select("opening_hours, calendar")
      .eq("restaurant_id", restaurantId).maybeSingle();
    const opening = (settings as any)?.opening_hours ?? null;
    const calendar = ((settings as any)?.calendar ?? {}) as CalendarData;

    // 1) Closure-Check (Urlaub / Feiertag)
    const closure = isClosureForDate(calendar, dateISO);
    if (closure && closure.blocks_booking !== false) {
      const aiMsg = closure.ai_message?.trim();
      const reason = closure.reason || "geschlossen";
      const customAiText = aiMsg
        ? aiMsg
        : `Wir haben vom ${closure.from} bis ${closure.to} geschlossen (${reason}).`;
      return textContent({
        available: false,
        closed: true,
        closure_reason: reason,
        closed_until: closure.to,
        instruction: `ABSAGEN: Restaurant am ${parsed.berlinLocal} geschlossen. Sage dem Gast wörtlich: "${customAiText}" Schlage einen Termin nach dem ${closure.to} vor.`,
        parsed_date: parsed.berlinLocal,
      });
    }

    // 2) Special-Hours-Check (Sondertage wie Heiligabend) — uebersteuern reguläre Zeiten
    const special = getSpecialHoursForDate(calendar, dateISO);
    if (special && special.slots.length > 0) {
      const startMin = startsAt.getUTCHours() * 60 + startsAt.getUTCMinutes();
      // Wir nutzen Berlin-Zeit fuer den Vergleich
      const fmt = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit", hour12: false,
      }).formatToParts(startsAt);
      const hh = Number(fmt.find((p) => p.type === "hour")?.value ?? "0");
      const mm = Number(fmt.find((p) => p.type === "minute")?.value ?? "0");
      const insideSpecial = isOpenAt(special.slots, hh, mm);
      if (!insideSpecial) {
        return textContent({
          available: false,
          instruction: `ABSAGEN: Am ${parsed.berlinLocal} gelten Sonderöffnungszeiten${special.note ? ` (${special.note})` : ""}: ${formatSlotsHuman(special.slots)}. Schlage dem Gast einen Slot in diesem Fenster vor.`,
          parsed_date: parsed.berlinLocal,
        });
      }
      // Special slot ok → weiter zum Tisch-Verfuegbarkeits-Check (Opening hours skip)
    } else {
      // 3) Reguläre Öffnungszeiten (nur wenn keine Sondertage greifen)
      const openingCheck = isWithinOpeningHours(startsAt, opening);
      if (openingCheck && !openingCheck.inside) {
        const dayNamesDe: Record<string, string> = { mo: "Montag", tu: "Dienstag", we: "Mittwoch", th: "Donnerstag", fr: "Freitag", sa: "Samstag", su: "Sonntag" };
        const closedMsg = openingCheck.slots.length > 0
          ? `Am ${dayNamesDe[openingCheck.dayKey]} haben wir von ${formatSlotsHuman(openingCheck.slots)} geöffnet.`
          : `Am ${dayNamesDe[openingCheck.dayKey]} ist geschlossen.`;
        return textContent({
          available: false,
          instruction: `ABSAGEN: Der gewünschte Zeitpunkt liegt außerhalb der Öffnungszeiten. ${closedMsg} Biete dem Gast eine Zeit innerhalb der Öffnungszeiten an.`,
          parsed_date: parsed.berlinLocal,
        });
      }
    }

    const [{ data: tables }, { data: zones }, { data: existing }] = await Promise.all([
      admin.from("tables").select("*").eq("restaurant_id", restaurantId),
      admin.from("zones").select("*").eq("restaurant_id", restaurantId),
      admin.from("reservations").select("*").eq("restaurant_id", restaurantId)
        .gte("starts_at", new Date(startsAt.getTime() - 4 * 3600_000).toISOString())
        .lte("starts_at", new Date(startsAt.getTime() + 4 * 3600_000).toISOString()),
    ]);

    const totalTables = (tables ?? []).length;
    if (totalTables === 0) {
      return textContent({
        available: false,
        total_tables_in_system: 0,
        instruction: "ABSAGEN: Es sind aktuell keine Tische im System konfiguriert. Dem Gast mitteilen, dass die Online-Reservierung momentan nicht möglich ist und er direkt unter 07803 926970 anrufen soll.",
      });
    }

    const ranked = rankCandidates({
      tables: (tables ?? []) as TableRow[],
      zones: (zones ?? []) as Zone[],
      existing: (existing ?? []) as Reservation[],
      partySize: party,
      startsAt,
      durationMin,
      preferredZoneName: (args.zone as string) ?? null,
      requireAccessible: !!args.accessible,
    });

    if (ranked.length === 0) {
      return textContent({
        available: false,
        total_tables_in_system: totalTables,
        parsed_date: parsed.berlinLocal,
        instruction: `ABSAGEN: Für ${party} Personen am ${parsed.berlinLocal} ist kein passender Tisch frei. Biete dem Gast eine andere Uhrzeit oder einen anderen Tag an.`,
      });
    }
    const best = ranked[0];
    const zoneName = (zones ?? []).find((z) => z.id === best.table.zone_id)?.name ?? "Innenraum";
    return textContent({
      available: true,
      parsed_date: parsed.berlinLocal,
      iso_used: parsed.iso,
      warning: parsed.warning,
      total_tables_in_system: totalTables,
      instruction: `BESTAETIGEN: Tisch für ${party} Personen am ${parsed.berlinLocal} im Bereich ${zoneName} ist verfügbar. Wiederhole dem Gast Datum, Uhrzeit und Personenzahl wörtlich, dann frage nach Namen und Telefonnummer.`,
      best: { label: best.table.label, seats: best.table.seats, zone: zoneName, reason: best.reason },
    });
  }

  // ==================================================================
  // 3) create_reservation
  // ==================================================================
  if (name === "create_reservation") {
    const party = Number(args.party_size);
    const startsRaw = args.starts_at as string | undefined;
    const durationMin = Number(args.duration_min ?? 90);

    const missing: string[] = [];
    if (!args.guest_name) missing.push("guest_name");
    if (!args.phone) missing.push("phone");
    if (!Number.isFinite(party) || party <= 0) missing.push("party_size");
    if (!startsRaw) missing.push("starts_at");
    if (missing.length) {
      return textContent({
        instruction: `NACHFRAGEN: Es fehlen noch: ${missing.join(", ")}. Frage den Gast gezielt nach den fehlenden Angaben und rufe das Tool dann erneut auf. KEINE Reservierung ohne vollständige Daten.`,
        missing,
      });
    }

    const parsed = parseStartsAt(startsRaw!);
    if (!parsed.ok || !parsed.iso) {
      return textContent({
        instruction: `NACHFRAGEN: Datum und Uhrzeit sind unklar (${parsed.error}). Frage den Gast nochmal nach dem konkreten Tag und der Uhrzeit.`,
      });
    }
    const startsAt = new Date(parsed.iso);

    // Opening hours check
    const { data: settings } = await admin.from("settings").select("opening_hours").eq("restaurant_id", restaurantId).maybeSingle();
    const opening = (settings as any)?.opening_hours ?? null;
    const openingCheck2 = isWithinOpeningHours(startsAt, opening);
    if (openingCheck2 && !openingCheck2.inside) {
      return textContent({
        instruction: "ABSAGEN: Zeitpunkt liegt außerhalb der Öffnungszeiten. Keine Reservierung angelegt.",
      });
    }

    // Duplicate-check: same phone + same starts_at (±30 min)
    const { data: dup } = await admin.from("reservations").select("id, guest_name")
      .eq("restaurant_id", restaurantId)
      .eq("phone", args.phone as string)
      .gte("starts_at", new Date(startsAt.getTime() - 30 * 60_000).toISOString())
      .lte("starts_at", new Date(startsAt.getTime() + 30 * 60_000).toISOString())
      .not("status", "eq", "Storniert");
    if (dup && dup.length > 0) {
      return textContent({
        instruction: `NACHFRAGEN: Für diese Telefonnummer existiert bereits eine Reservierung zu dieser Zeit (${(dup as any)[0].guest_name}). Prüfe mit dem Gast ob das die selbe Reservierung ist. KEINE zweite Reservierung anlegen.`,
        existing_reservation_id: (dup as any)[0].id,
      });
    }

    const [{ data: tables }, { data: zones }, { data: existing }] = await Promise.all([
      admin.from("tables").select("*").eq("restaurant_id", restaurantId),
      admin.from("zones").select("*").eq("restaurant_id", restaurantId),
      admin.from("reservations").select("*").eq("restaurant_id", restaurantId)
        .gte("starts_at", new Date(startsAt.getTime() - 4 * 3600_000).toISOString())
        .lte("starts_at", new Date(startsAt.getTime() + 4 * 3600_000).toISOString()),
    ]);

    if ((tables ?? []).length === 0) {
      return textContent({ instruction: "ABSAGEN: Keine Tische im System. Keine Reservierung. Verweise auf 07803 926970." });
    }

    const decision = autoAssign({
      tables: (tables ?? []) as TableRow[],
      zones: (zones ?? []) as Zone[],
      existing: (existing ?? []) as Reservation[],
      partySize: party,
      startsAt,
      durationMin,
      preferredZoneName: (args.zone as string) ?? null,
      requireAccessible: !!args.accessible,
    });

    // 5-stellige Buchungsnummer generieren (Voice-friendly fuer Storno)
    const code = await generateUniqueBookingCode(admin, restaurantId);

    const { data: reservation, error } = await admin.from("reservations").insert({
      restaurant_id: restaurantId,
      table_id: decision.tableId,
      guest_name: args.guest_name as string,
      phone: (args.phone as string) ?? null,
      email: (args.email as string) ?? null,
      party_size: party,
      starts_at: startsAt.toISOString(),
      duration_min: durationMin,
      source: "Voice-KI",
      status: decision.status,
      note: (args.note as string) ?? null,
      auto_assigned: decision.autoAssigned,
      approval_reason: decision.approvalReason,
      code,
    }).select().single();

    if (error || !reservation) {
      logVoiceEventAsync({
        restaurantId,
        source: "mcp",
        kind: "error",
        tool: "create_reservation",
        message: `Reservierung konnte nicht gespeichert werden: ${error?.message ?? "unbekannter DB-Fehler"}`,
        details: {
          guest_name: args.guest_name,
          party_size: party,
          starts_at: startsAt.toISOString(),
          db_error: error?.message,
        },
      });
      return textContent({ instruction: `ABSAGEN: Reservierung konnte nicht gespeichert werden. Gast soll unter 07803 926970 anrufen.` });
    }

    const assignedTable = decision.tableId ? ((tables ?? []) as TableRow[]).find((t) => t.id === decision.tableId) : null;
    const zoneName = assignedTable?.zone_id ? (zones ?? []).find((z) => z.id === assignedTable.zone_id)?.name ?? null : null;

    // Buchungsnummer als gesprochene Ziffern fuer das Voice-Modell formatieren
    // („vier-zwei-sieben-eins-acht" statt „zweiundvierzigtausend siebenhundertachtzehn")
    const codeSpoken = code ? code.split("").join("-") : null;

    let instruction: string;
    if (!assignedTable) {
      instruction = `ABSAGEN: Kein Tisch verfügbar. Reservierung nicht angelegt.`;
    } else if (decision.status === "Angefragt") {
      // Stammtisch / VIP-Tisch: Team muss freigeben. Voice-KI sagt NOTIEREN.
      instruction = `NOTIEREN: Reservierung vorgemerkt für ${args.guest_name}, ${party} Personen, ${parsed.berlinLocal}, Bereich ${zoneName ?? "Innenraum"}. Sage dem Gast wörtlich: "Alles klar, ich habe Sie notiert — ein Kollege bestätigt Ihnen das zeitnah, Sie bekommen eine kurze Rückmeldung." KEINE feste Zusage geben.`;
    } else {
      // Normaler Fall: jede erfolgreiche Buchung ist direkt Bestaetigt.
      // Buchungsnummer wird am Ende zum Mitnotieren angesagt.
      const codeHint = codeSpoken
        ? ` Sage am Ende wörtlich: "Ihre Buchungsnummer ist ${codeSpoken} — falls Sie umbuchen oder stornieren möchten, einfach die Nummer durchgeben."`
        : "";
      instruction = `FERTIG: Reservierung fest für ${args.guest_name}, ${party} Personen, ${parsed.berlinLocal}, Bereich ${zoneName ?? "Innenraum"}. Bestätige: "Perfekt, ich habe Sie fest eingetragen, wir freuen uns auf Sie."${codeHint}`;
    }
    return textContent({
      reservation_id: reservation.id,
      booking_code: code,
      booking_code_spoken: codeSpoken,
      status: decision.status,
      requires_approval: decision.status === "Angefragt",
      approval_reason: decision.approvalReason,
      parsed_date: parsed.berlinLocal,
      instruction,
    });
  }

  // ==================================================================
  // 4) get_opening_hours
  // ==================================================================
  if (name === "get_opening_hours") {
    const { data } = await admin.from("settings").select("opening_hours").eq("restaurant_id", restaurantId).maybeSingle();
    const hoursRaw = (data as any)?.opening_hours as Record<string, unknown> | null;
    const days: Record<string, string> = { mo: "Montag", tu: "Dienstag", we: "Mittwoch", th: "Donnerstag", fr: "Freitag", sa: "Samstag", su: "Sonntag" };

    // Berlin-Wochentag (nicht UTC, sonst kommt in der Nacht der falsche Tag raus)
    const wd = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", weekday: "short" })
      .formatToParts(new Date()).find((p) => p.type === "weekday")?.value ?? "";
    const wdMap: Record<string, string> = { Sun: "su", Mon: "mo", Tue: "tu", Wed: "we", Thu: "th", Fri: "fr", Sat: "sa" };
    const dayKey = wdMap[wd] ?? "mo";

    const slotsToday = normalizeOpeningSlots(hoursRaw?.[dayKey]);
    const todayHumanSlots = formatSlotsHuman(slotsToday);

    // Auch alle Tage in normalisierter Form mitliefern, falls die KI nach
    // einem anderen Tag fragen soll
    const allNormalised: Record<string, OpeningSlot[]> = {};
    for (const k of Object.keys(days)) {
      allNormalised[k] = normalizeOpeningSlots(hoursRaw?.[k]);
    }

    const instruction = slotsToday.length > 0
      ? `Heute (${days[dayKey]}) ist von ${todayHumanSlots} geöffnet. Nenne dem Gast nur den für seine Frage relevanten Tag. Falls mehrere Slots: explizit „von X bis Y und von A bis B" sagen — Mittagspause klar machen.`
      : `Heute (${days[dayKey]}) ist geschlossen. Dem Gast das höflich mitteilen.`;

    return textContent({
      hours: allNormalised,
      today: days[dayKey],
      today_slots: slotsToday,
      today_human: todayHumanSlots,
      instruction,
    });
  }

  // ==================================================================
  // 5) cancel_reservation
  // Robuste Suche: Name + Telefon + Zeitfenster. Beide Felder werden
  // unscharf verglichen (Name case-insensitive partial, Telefon
  // formatunabhaengig). Bei mehreren Treffern → NACHFRAGEN.
  // ==================================================================
  // ==================================================================
  // get_restaurant_context — wird zu Beginn jedes Anrufs gerufen
  // ==================================================================
  if (name === "get_restaurant_context") {
    const { data } = await admin.from("settings")
      .select("calendar")
      .eq("restaurant_id", restaurantId).maybeSingle();
    const calendar = ((data as any)?.calendar ?? {}) as CalendarData;
    const today = todayBerlinISO();

    const closureToday = isClosureForDate(calendar, today);
    const specialToday = getSpecialHoursForDate(calendar, today);
    const announcements = getActiveAnnouncements(calendar, today);
    const upcoming = getUpcomingClosures(calendar, today, 3);

    let instruction: string;
    if (closureToday) {
      const aiMsg = closureToday.ai_message?.trim();
      const fallback = `Wir haben vom ${closureToday.from} bis ${closureToday.to} geschlossen (${closureToday.reason}).`;
      instruction = `WICHTIG: Heute ist geschlossen. Wenn der Gast eine Reservierung will, sage höflich: "${aiMsg ?? fallback}" Schlage einen Termin nach dem ${closureToday.to} vor.`;
    } else if (specialToday) {
      instruction = `Heute (${today}) gelten Sonderöffnungszeiten${specialToday.note ? ` — ${specialToday.note}` : ""}: ${formatSlotsHuman(specialToday.slots)}. Erwähne das wenn der Gast nach Öffnungszeiten oder einer Buchung fragt.`;
    } else if (announcements.length > 0) {
      instruction = `Aktuelle Ankündigungen: ${announcements.map((a) => `"${a.message}"`).join(" / ")}. Erwähne MAXIMAL EINE wenn passend (z.B. wenn der Gast nach Programm/Tagesgericht fragt). Niemals alle gleichzeitig vorlesen.`;
    } else {
      instruction = "Normalbetrieb heute. Falls der Gast nach besonderen Sachen fragt, gibt es nichts zu erwähnen.";
    }

    return textContent({
      today_date: today,
      is_closed_today: !!closureToday,
      closure_today: closureToday,
      special_hours_today: specialToday,
      upcoming_closures: upcoming,
      active_announcements: announcements.map((a) => a.message),
      menu_available: !!getDocumentText(calendar.menu),
      allergens_available: !!getDocumentText(calendar.allergens),
      menu_highlights: calendar.menu_highlights ?? [],
      policies: calendar.policies ?? {},
      instruction,
    });
  }

  // ==================================================================
  // lookup_menu — Substring-Suche in Menue/Allergen-Texten
  // ==================================================================
  if (name === "lookup_menu") {
    const query = String(args.query ?? "").toLowerCase().trim();
    if (!query || query.length < 2) {
      return textContent({
        instruction: "NACHFRAGEN: Was genau soll ich im Menü suchen? Bitte ein Stichwort vom Gast erfragen.",
      });
    }
    const source = (args.source as string) ?? "both";

    const { data } = await admin.from("settings")
      .select("calendar")
      .eq("restaurant_id", restaurantId).maybeSingle();
    const calendar = ((data as any)?.calendar ?? {}) as CalendarData;

    const sources: { type: string; text: string }[] = [];
    const menuText = getDocumentText(calendar.menu);
    const allergensText = getDocumentText(calendar.allergens);
    if ((source === "menu" || source === "both") && menuText) {
      sources.push({ type: "Speisekarte", text: menuText });
    }
    if ((source === "allergens" || source === "both") && allergensText) {
      sources.push({ type: "Allergene", text: allergensText });
    }

    if (sources.length === 0) {
      return textContent({
        query,
        matches: [],
        instruction: "NACHFRAGEN: Wir haben aktuell keine Speisekarte hochgeladen. Bitte den Gast vor Ort oder direkt am Telefon mit einem Kollegen sprechen lassen.",
      });
    }

    const matches: { source: string; snippet: string }[] = [];
    for (const src of sources) {
      const haystack = src.text.toLowerCase();
      let idx = 0;
      while (matches.length < 5) {
        const found = haystack.indexOf(query, idx);
        if (found === -1) break;
        const start = Math.max(0, found - 60);
        const end = Math.min(src.text.length, found + query.length + 140);
        const snippet = src.text.slice(start, end).replace(/\s+/g, " ").trim();
        matches.push({ source: src.type, snippet });
        idx = found + query.length;
      }
      if (matches.length >= 5) break;
    }

    if (matches.length === 0) {
      return textContent({
        query,
        matches: [],
        instruction: `NACHFRAGEN: "${query}" finde ich nicht im hochgeladenen Speisekarten-/Allergen-Text. Frag den Gast ob er was anderes meinen könnte oder verbinde ihn an die Küche weiter.`,
      });
    }

    const compact = matches.slice(0, 3).map((m) => `[${m.source}] ${m.snippet}`).join("  •  ");
    return textContent({
      query,
      matches,
      instruction: `Erzähl dem Gast natürlich was du gefunden hast: "${compact}". WICHTIG: nicht wörtlich vorlesen, fasse es zusammen, in kurzen Sätzen. Preise nur nennen wenn sie im Snippet stehen — niemals raten oder erfinden.`,
    });
  }

  if (name === "cancel_reservation") {
    // Fast-Path 1: Buchungsnummer (Code) — bevorzugt!
    if (args.code) {
      const cleanCode = String(args.code).replace(/\D/g, "");
      if (cleanCode.length >= 4 && cleanCode.length <= 6) {
        const { data: hits } = await admin.from("reservations")
          .select("id, guest_name, party_size, starts_at, status, code")
          .eq("restaurant_id", restaurantId)
          .eq("code", cleanCode)
          .not("status", "eq", "Storniert");
        const target = (hits ?? [])[0];
        if (target) {
          const { error: updErr } = await admin.from("reservations")
            .update({ status: "Storniert" })
            .eq("id", target.id)
            .eq("restaurant_id", restaurantId);
          if (updErr) {
            logVoiceEventAsync({
              restaurantId,
              source: "mcp",
              kind: "error",
              tool: "cancel_reservation",
              message: `Storno fehlgeschlagen: ${updErr.message}`,
              details: { reservation_id: target.id, code: cleanCode },
              reservationId: target.id,
            });
            return textContent({ instruction: `ABSAGEN: Storno fehlgeschlagen (${updErr.message}).` });
          }
          const t = new Date(target.starts_at).toLocaleString("de-DE", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });
          return textContent({
            cancelled: 1,
            cancelled_reservation: { id: target.id, name: target.guest_name, code: target.code, party_size: target.party_size, starts_at: target.starts_at },
            match_kind: "Buchungsnummer",
            instruction: `FERTIG: Reservierung Nr. ${target.code} von ${target.guest_name} (${target.party_size} Personen, ${t}) storniert. Sage dem Gast wörtlich: "Hab ich für Sie storniert, kein Problem. Schönen Tag noch."`,
          });
        }
        // Code mitgegeben, aber kein Treffer — KI darf trotzdem auf Name/Telefon-Pfad weiterprobieren wenn Daten da sind
        if (!args.guest_name && !args.phone) {
          return textContent({
            instruction: `NACHFRAGEN: Buchungsnummer „${cleanCode}" finde ich nicht. Frag den Gast nach Namen UND Telefonnummer und Datum/Uhrzeit der Reservierung — dann kann ich noch mal suchen.`,
          });
        }
        // sonst: weiter zum Name/Phone-Pfad unten
      }
    }

    // Fast-Path 2: direkte UUID
    if (args.reservation_id) {
      const { data, error } = await admin.from("reservations")
        .update({ status: "Storniert" })
        .eq("id", args.reservation_id as string)
        .eq("restaurant_id", restaurantId)
        .select("id, guest_name").single();
      if (error || !data) return textContent({ instruction: "NACHFRAGEN: Diese Reservierungs-ID konnte ich nicht finden." });
      return textContent({
        cancelled: 1,
        instruction: `FERTIG: Reservierung von ${data.guest_name} storniert. Sage dem Gast: "Hab ich für Sie storniert, kein Problem."`,
      });
    }

    // Wir brauchen mindestens starts_at + (name oder phone)
    if (!args.starts_at) {
      return textContent({
        instruction: "NACHFRAGEN: Frag den Gast nach Namen, Telefonnummer und ursprünglichem Datum/Uhrzeit der Reservierung.",
      });
    }
    if (!args.guest_name && !args.phone) {
      return textContent({
        instruction: "NACHFRAGEN: Frag den Gast nach dem Namen UND der Telefonnummer der Reservierung — beides zusammen identifiziert sie eindeutig.",
      });
    }

    const parsed = parseStartsAt(args.starts_at as string);
    if (!parsed.ok || !parsed.iso) {
      return textContent({
        instruction: `NACHFRAGEN: Datum/Uhrzeit unklar (${parsed.error ?? "unbekannt"}). Frag nochmal nach dem genauen Termin.`,
      });
    }

    const start = new Date(parsed.iso);
    // 60-Minuten-Fenster um den genannten Zeitpunkt — falls Gast etwas neben der echten Zeit ratet
    const { data: candidates } = await admin.from("reservations")
      .select("id, guest_name, phone, party_size, starts_at, table_id")
      .eq("restaurant_id", restaurantId)
      .gte("starts_at", new Date(start.getTime() - 60 * 60_000).toISOString())
      .lte("starts_at", new Date(start.getTime() + 60 * 60_000).toISOString())
      .not("status", "eq", "Storniert")
      .order("starts_at");

    type Cand = { id: string; guest_name: string; phone: string | null; party_size: number; starts_at: string; table_id: string | null };
    const all = (candidates ?? []) as Cand[];

    // Score: Name-Match + Phone-Match. Beide → 2, eines → 1, keins → 0.
    const searchName = (args.guest_name as string | undefined)?.trim().toLowerCase() ?? "";
    const searchPhone = (args.phone as string | undefined) ?? "";
    const scored = all.map((c) => {
      const nameHit = !!searchName && c.guest_name?.toLowerCase().includes(searchName);
      const phoneHit = !!searchPhone && phonesMatch(c.phone, searchPhone);
      return { c, score: (nameHit ? 1 : 0) + (phoneHit ? 1 : 0), nameHit, phoneHit };
    }).filter((s) => s.score > 0);

    // Bevorzugt volle Treffer (score 2), sonst halb-Treffer (score 1)
    const best = scored.filter((s) => s.score === 2);
    const half = scored.filter((s) => s.score === 1);
    const matches = best.length > 0 ? best : half;

    if (matches.length === 0) {
      const nearbyList = all.slice(0, 4).map((c) =>
        `${c.guest_name} (${c.party_size}P, ${new Date(c.starts_at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" })})`
      ).join(", ");
      logVoiceEventAsync({
        restaurantId,
        source: "mcp",
        kind: "warning",
        tool: "cancel_reservation",
        message: `Storno-Anfrage ohne Treffer (Name: ${searchName || "—"}, Phone: ${searchPhone || "—"}, Zeit: ${parsed.berlinLocal})`,
        details: {
          search_name: searchName,
          search_phone: searchPhone,
          requested_time: parsed.berlinLocal,
          nearby_count: all.length,
        },
      });
      return textContent({
        instruction: nearbyList
          ? `NACHFRAGEN: Mit Name „${searchName}" und Telefon „${searchPhone}" habe ich keine Reservierung um ${parsed.berlinLocal} gefunden. In dem Zeitfenster habe ich aber: ${nearbyList}. Frag den Gast ob einer davon passt oder ob die Zeit eine andere war.`
          : `NACHFRAGEN: Ich finde keine Reservierung in dem Zeitfenster. Vielleicht falsches Datum? Frag den Gast nochmal nach dem genauen Tag.`,
      });
    }

    if (matches.length > 1) {
      // Mehrdeutig: AI soll nach Personenzahl oder weiterem Detail fragen
      const list = matches.slice(0, 3).map((s) =>
        `${s.c.guest_name} (${s.c.party_size} Personen, ${new Date(s.c.starts_at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" })})`
      ).join(" oder ");
      return textContent({
        instruction: `NACHFRAGEN: Ich finde mehrere passende Reservierungen: ${list}. Frag den Gast nach der Personenzahl oder zusätzlichem Detail um die richtige zu finden.`,
      });
    }

    // Genau einer → stornieren
    const target = matches[0].c;
    const { error: updErr } = await admin.from("reservations")
      .update({ status: "Storniert" })
      .eq("id", target.id)
      .eq("restaurant_id", restaurantId);
    if (updErr) {
      return textContent({ instruction: `ABSAGEN: Storno fehlgeschlagen (${updErr.message}). Bitte nochmal versuchen.` });
    }

    const matchKind = matches[0].score === 2 ? "Name + Telefon" : matches[0].nameHit ? "Name" : "Telefon";
    return textContent({
      cancelled: 1,
      cancelled_reservation: {
        id: target.id,
        name: target.guest_name,
        party_size: target.party_size,
        starts_at: target.starts_at,
      },
      match_kind: matchKind,
      instruction: `FERTIG: Reservierung von ${target.guest_name} (${target.party_size} Personen, ${parsed.berlinLocal}) storniert. Sage dem Gast wörtlich: "Hab ich für Sie storniert, kein Problem. Schönen Tag noch."`,
    });
  }

  throw new Error(`Unknown tool: ${name}`);
}

export async function POST(request: Request) {
  const auth = await authenticateWebhook(request);
  if ("error" in auth) {
    return NextResponse.json(rpcError(null, -32000, auth.error), { status: auth.status });
  }

  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json(rpcError(null, -32700, "Parse error"), { status: 400 }); }

  const requests = Array.isArray(body) ? body : [body];
  const responses: any[] = [];

  for (const req of requests) {
    const { id = null, method, params = {} } = req ?? {};
    let toolName: string | null = null;
    let toolArgs: unknown = undefined;
    try {
      if (method === "initialize") {
        responses.push(rpcResult(id, {
          protocolVersion: "2024-11-05",
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "hostsystem-mcp", version: "2.0.0-bulletproof" },
        }));
      } else if (method === "notifications/initialized") {
        // no response
      } else if (method === "ping") {
        responses.push(rpcResult(id, {}));
      } else if (method === "tools/list") {
        responses.push(rpcResult(id, { tools: TOOLS }));
      } else if (method === "tools/call") {
        const { name, arguments: args = {} } = params as { name: string; arguments?: Record<string, unknown> };
        toolName = name; toolArgs = args;
        const result = await callTool(name, args, auth.restaurantId);
        responses.push(rpcResult(id, result));
      } else {
        responses.push(rpcError(id, -32601, `Method not found: ${method}`));
        logVoiceEventAsync({
          restaurantId: auth.restaurantId,
          source: "mcp",
          kind: "warning",
          message: `Unbekannte JSON-RPC-Methode: ${method}`,
          details: { method, params },
        });
      }
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      responses.push(rpcError(id, -32603, msg));
      logVoiceEventAsync({
        restaurantId: auth.restaurantId,
        source: "mcp",
        kind: "error",
        tool: toolName,
        message: toolName ? `Tool "${toolName}" ist abgestürzt: ${msg}` : `MCP-Fehler: ${msg}`,
        details: {
          method,
          tool: toolName,
          args: toolArgs,
          stack: typeof err?.stack === "string" ? err.stack.slice(0, 800) : undefined,
        },
      });
    }
  }

  const toReturn = responses.filter(Boolean);
  if (toReturn.length === 0) return new NextResponse(null, { status: 204 });
  return NextResponse.json(Array.isArray(body) ? toReturn : toReturn[0]);
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    server: "hostsystem-mcp",
    version: "2.0.0-bulletproof",
    tools: TOOLS.map((t) => t.name),
    ...currentDateTimeInfo(),
  });
}
