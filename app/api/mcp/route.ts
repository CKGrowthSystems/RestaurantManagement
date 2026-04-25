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
import { rankCandidates, autoAssign } from "@/lib/assignment";
import { parseStartsAt, currentDateTimeInfo } from "@/lib/date-parsing";
import { phonesMatch } from "@/lib/phone";
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
    name: "cancel_reservation",
    description:
      "Storniert eine bestehende Reservierung. WICHTIG: Frag den Gast IMMER nach dem NAMEN UND der TELEFONNUMMER und dem ursprüngliche Datum/Uhrzeit. Beides zusammen identifiziert die Reservierung eindeutig. Bei mehreren Treffern bekommst du eine NACHFRAGEN-Instruction mit den Optionen — frag den Gast dann nach Personenzahl oder zusätzlichem Detail. reservation_id ist alternativ wenn bekannt.",
    inputSchema: {
      type: "object",
      properties: {
        reservation_id: { type: "string", description: "Direkte ID, falls bekannt — sonst leer lassen." },
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
function isWithinOpeningHours(d: Date, openingHours: Record<string, { open: string; close: string }> | null): { inside: boolean; weekday: string; dayKey: string; hh: number; mm: number } | null {
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
  const day = openingHours[dayKey];
  if (!day) return { inside: false, weekday, dayKey, hh, mm };
  const [oh, om] = day.open.split(":").map(Number);
  const [ch, cm] = day.close.split(":").map(Number);
  const nowMin = hh * 60 + mm;
  const inside = nowMin >= oh * 60 + om && nowMin <= ch * 60 + cm;
  return { inside, weekday, dayKey, hh, mm };
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

    // Opening hours check
    const { data: settings } = await admin.from("settings").select("opening_hours").eq("restaurant_id", restaurantId).maybeSingle();
    const opening = (settings as any)?.opening_hours ?? null;
    const openingCheck = isWithinOpeningHours(startsAt, opening);
    if (openingCheck && !openingCheck.inside) {
      const dayNamesDe: Record<string, string> = { mo: "Montag", tu: "Dienstag", we: "Mittwoch", th: "Donnerstag", fr: "Freitag", sa: "Samstag", su: "Sonntag" };
      const hoursToday = opening?.[openingCheck.dayKey];
      const closedMsg = hoursToday
        ? `Am ${dayNamesDe[openingCheck.dayKey]} haben wir von ${hoursToday.open} bis ${hoursToday.close} geöffnet.`
        : `Am ${dayNamesDe[openingCheck.dayKey]} ist geschlossen.`;
      return textContent({
        available: false,
        instruction: `ABSAGEN: Der gewünschte Zeitpunkt liegt außerhalb der Öffnungszeiten. ${closedMsg} Biete dem Gast eine Zeit innerhalb der Öffnungszeiten an.`,
        parsed_date: parsed.berlinLocal,
      });
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
    }).select().single();

    if (error || !reservation) {
      return textContent({ instruction: `ABSAGEN: Reservierung konnte nicht gespeichert werden. Gast soll unter 07803 926970 anrufen.` });
    }

    const assignedTable = decision.tableId ? ((tables ?? []) as TableRow[]).find((t) => t.id === decision.tableId) : null;
    const zoneName = assignedTable?.zone_id ? (zones ?? []).find((z) => z.id === assignedTable.zone_id)?.name ?? null : null;

    let instruction: string;
    if (!assignedTable) {
      instruction = `ABSAGEN: Kein Tisch verfügbar. Reservierung nicht angelegt.`;
    } else if (decision.status === "Angefragt") {
      // Stammtisch / VIP-Tisch: Team muss freigeben. Voice-KI sagt NOTIEREN.
      instruction = `NOTIEREN: Reservierung vorgemerkt für ${args.guest_name}, ${party} Personen, ${parsed.berlinLocal}, Bereich ${zoneName ?? "Innenraum"}. Sage dem Gast wörtlich: "Alles klar, ich habe Sie notiert — ein Kollege bestätigt Ihnen das zeitnah, Sie bekommen eine kurze Rückmeldung." KEINE feste Zusage geben.`;
    } else {
      // Normaler Fall: jede erfolgreiche Buchung ist direkt Bestaetigt.
      instruction = `FERTIG: Reservierung fest für ${args.guest_name}, ${party} Personen, ${parsed.berlinLocal}, Bereich ${zoneName ?? "Innenraum"}. Bestätige: "Perfekt, ich habe Sie fest eingetragen, wir freuen uns auf Sie."`;
    }
    return textContent({
      reservation_id: reservation.id,
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
    const hoursData = (data as any)?.opening_hours as Record<string, { open: string; close: string }> | null;
    const days: Record<string, string> = { mo: "Montag", tu: "Dienstag", we: "Mittwoch", th: "Donnerstag", fr: "Freitag", sa: "Samstag", su: "Sonntag" };
    const dayKey = ["su","mo","tu","we","th","fr","sa"][new Date().getDay()];
    const todayHours = hoursData?.[dayKey];
    const instruction = todayHours
      ? `Heute (${days[dayKey]}) ist von ${todayHours.open} bis ${todayHours.close} geöffnet. Nenne dem Gast nur den für seine Frage relevanten Tag.`
      : `Heute geschlossen. Dem Gast das höflich mitteilen.`;
    return textContent({ hours: hoursData, today: days[dayKey], instruction });
  }

  // ==================================================================
  // 5) cancel_reservation
  // Robuste Suche: Name + Telefon + Zeitfenster. Beide Felder werden
  // unscharf verglichen (Name case-insensitive partial, Telefon
  // formatunabhaengig). Bei mehreren Treffern → NACHFRAGEN.
  // ==================================================================
  if (name === "cancel_reservation") {
    // Fast-Path: direkte ID
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
        const result = await callTool(name, args, auth.restaurantId);
        responses.push(rpcResult(id, result));
      } else {
        responses.push(rpcError(id, -32601, `Method not found: ${method}`));
      }
    } catch (err: any) {
      responses.push(rpcError(id, -32603, err?.message ?? String(err)));
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
