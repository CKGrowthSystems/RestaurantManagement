import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { authenticateWebhook, logWebhook } from "@/lib/voice-auth";
import { rankCandidates } from "@/lib/assignment";
import type { Reservation, TableRow, Zone } from "@/lib/types";

/**
 * POST /api/v1/voice/availability
 *
 * Request body:
 *   {
 *     "party_size": 4,
 *     "starts_at": "2026-04-24T19:30:00+02:00",
 *     "duration_min": 90,               // optional, default 90
 *     "zone": "Terrasse",               // optional preference
 *     "accessible": false               // optional accessibility requirement
 *   }
 *
 * Response:
 *   {
 *     "available": true,
 *     "slot": { "starts_at": ..., "duration_min": 90 },
 *     "best": { "table_id": "...", "label": "A2", "seats": 4, "zone": "Terrasse", "reason": "Perfekter Match" },
 *     "candidates": [ ...up to 5 ]
 *   }
 */
export async function POST(request: Request) {
  const auth = await authenticateWebhook(request);
  const body = await request.json().catch(() => ({}));
  const endpoint = "/api/v1/voice/availability";
  const ip = request.headers.get("x-forwarded-for");

  if ("error" in auth) {
    await logWebhook({ restaurantId: null, endpoint, method: "POST", statusCode: auth.status, requestBody: body, responseBody: { error: auth.error }, ip });
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const party = Number(body.party_size);
  const durationMin = Number(body.duration_min ?? 90);
  const startsAtRaw = body.starts_at;
  const bodyIsEmpty = Object.keys(body).length === 0;

  if (bodyIsEmpty) {
    // Reiner Test-Ping von GHL beim Speichern: 200 damit Save-Flow durchgeht.
    const resp = {
      ok: true, test: true, available: false,
      instruction: "NUR-TEST: Dies ist ein Verbindungs-Test ohne Parameter. Ignorieren, nicht zum Gast sprechen.",
    };
    await logWebhook({ restaurantId: auth.restaurantId, endpoint, method: "POST", statusCode: 200, requestBody: body, responseBody: resp, ip });
    return NextResponse.json(resp);
  }

  if (!Number.isFinite(party) || party <= 0 || !startsAtRaw) {
    const resp = {
      ok: true, available: false,
      instruction: "NACHFRAGEN: Es fehlen party_size oder starts_at. Frage den Gast nach Personenzahl UND Datum/Uhrzeit und rufe check_availability erneut auf. KEINE Reservierung ohne diese Daten bestätigen.",
      missing: { party_size: !Number.isFinite(party) || party <= 0, starts_at: !startsAtRaw },
    };
    await logWebhook({ restaurantId: auth.restaurantId, endpoint, method: "POST", statusCode: 200, requestBody: body, responseBody: resp, ip });
    return NextResponse.json(resp);
  }
  const startsAt = new Date(startsAtRaw);

  const admin = createAdminClient();
  const [{ data: tables }, { data: zones }, { data: existing }] = await Promise.all([
    admin.from("tables").select("*").eq("restaurant_id", auth.restaurantId),
    admin.from("zones").select("*").eq("restaurant_id", auth.restaurantId),
    admin.from("reservations").select("*").eq("restaurant_id", auth.restaurantId)
      .gte("starts_at", new Date(startsAt.getTime() - 4 * 3600_000).toISOString())
      .lte("starts_at", new Date(startsAt.getTime() + 4 * 3600_000).toISOString()),
  ]);

  const ranked = rankCandidates({
    tables: (tables ?? []) as TableRow[],
    zones: (zones ?? []) as Zone[],
    existing: (existing ?? []) as Reservation[],
    partySize: party,
    startsAt,
    durationMin,
    preferredZoneName: body.zone ?? null,
    requireAccessible: !!body.accessible,
  });

  const zoneById = new Map((zones ?? []).map((z) => [z.id, z.name]));
  const mapCand = (c: typeof ranked[number]) => ({
    table_id: c.table.id,
    label: c.table.label,
    seats: c.table.seats,
    shape: c.table.shape,
    zone: zoneById.get(c.table.zone_id ?? "") ?? null,
    accessible: c.table.accessible,
    reason: c.reason,
  });

  const timeStr = startsAt.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });
  const dateStr = startsAt.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Berlin" });
  const zoneTxt = body.zone ? ` im Bereich ${body.zone}` : "";
  const totalTables = (tables ?? []).length;

  let instruction: string;
  let available = false;
  if (totalTables === 0) {
    instruction = `ABSAGEN: Es sind aktuell keine Tische im System konfiguriert. Dem Gast höflich mitteilen, dass momentan keine Online-Reservierung möglich ist und er direkt unter 07803 926970 anrufen soll.`;
  } else if (ranked.length === 0) {
    instruction = `ABSAGEN: Für ${party} Personen am ${dateStr} um ${timeStr}${zoneTxt} ist kein Tisch verfügbar. Dem Gast eine Alternativzeit vorschlagen oder nachfragen.`;
  } else {
    available = true;
    const best = ranked[0];
    const zName = zoneById.get(best.table.zone_id ?? "") ?? "Innenraum";
    instruction = `BESTÄTIGEN: Tisch für ${party} Personen am ${dateStr} um ${timeStr} im Bereich ${zName} ist verfügbar. Dem Gast das Datum, die Uhrzeit und den Bereich bestätigen und nach Namen und Telefonnummer fragen.`;
  }

  const resp = {
    available,
    instruction,
    slot: { starts_at: startsAt.toISOString(), duration_min: durationMin },
    best: ranked[0] ? mapCand(ranked[0]) : null,
    candidates: ranked.slice(0, 5).map(mapCand),
    total_tables_in_system: totalTables,
  };

  await logWebhook({ restaurantId: auth.restaurantId, endpoint, method: "POST", statusCode: 200, requestBody: body, responseBody: resp, ip });
  return NextResponse.json(resp);
}
