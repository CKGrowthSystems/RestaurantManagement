import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { authenticateWebhook, logWebhook } from "@/lib/voice-auth";
import { autoAssign } from "@/lib/assignment";
import { generateUniqueBookingCode } from "@/lib/booking-code";
import { logVoiceEventAsync } from "@/lib/voice-events";
import { readIdempotencyKey, checkIdempotency, storeIdempotency } from "@/lib/idempotency";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { notifyAsync } from "@/lib/notifications";
import type { Reservation, TableRow, Zone } from "@/lib/types";

/**
 * POST /api/v1/voice/reservation
 *
 * Body (GoHighLevel calls this during live phone conversations):
 *   {
 *     "guest_name": "Familie Dimitriou",
 *     "phone": "+49 171 4412...",
 *     "email": null,
 *     "party_size": 4,
 *     "starts_at": "2026-04-24T19:30:00+02:00",
 *     "duration_min": 90,
 *     "zone": "Terrasse",
 *     "accessible": false,
 *     "note": "Kinderstuhl",
 *     "call": { "phone": "...", "duration_sec": 154, "transcript": [...] }
 *   }
 *
 * Table assignment rules:
 *   - any candidate found → auto-confirm ("Bestätigt"), approval_reason set if a
 *     larger table was used (shown as a note on the card, but no gate anymore)
 *   - no candidate → unassigned Bestätigt (team assigns manually)
 */
export async function POST(request: Request) {
  const auth = await authenticateWebhook(request);
  const body = await request.json().catch(() => ({}));
  const endpoint = "/api/v1/voice/reservation";
  const ip = request.headers.get("x-forwarded-for");

  if ("error" in auth) {
    await logWebhook({ restaurantId: null, endpoint, method: "POST", statusCode: auth.status, requestBody: body, responseBody: { error: auth.error }, ip });
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  // Rate-Limit: 60 req/min pro Restaurant auf REST-Voice-Endpoints.
  const rl = await checkRateLimit("voice_rest", auth.restaurantId);
  const rlResp = rateLimitResponse(rl);
  if (rlResp) {
    logVoiceEventAsync({
      restaurantId: auth.restaurantId,
      source: "rest",
      kind: "warning",
      tool: "reservation",
      message: `Rate-Limit auf /reservation erreicht: ${rl.currentCount}/${rl.limit} in 60s`,
      details: { limit: rl.limit, current: rl.currentCount },
    });
    await logWebhook({ restaurantId: auth.restaurantId, endpoint, method: "POST", statusCode: 429, requestBody: body, responseBody: rlResp.body, ip });
    return NextResponse.json(rlResp.body, { status: 429, headers: rlResp.headers });
  }

  // Idempotency: wenn der Voice-Agent denselben POST mit demselben
  // Idempotency-Key zweimal sendet (Netz-Retry), liefern wir die gecachte
  // Antwort statt eine zweite Reservierung anzulegen.
  const idemKey = readIdempotencyKey(request);
  if (idemKey) {
    const cached = await checkIdempotency(auth.restaurantId, idemKey, endpoint);
    if (cached) {
      return NextResponse.json(cached.body, {
        status: cached.status,
        headers: { "x-idempotent-replay": cached.cached_at },
      });
    }
  }

  const party = Number(body.party_size);
  const durationMin = Number(body.duration_min ?? 90);
  const bodyIsEmpty = Object.keys(body).length === 0;

  if (bodyIsEmpty) {
    const resp = {
      ok: true, test: true,
      instruction: "NUR-TEST: Verbindungs-Test ohne Parameter. Ignorieren.",
    };
    await logWebhook({ restaurantId: auth.restaurantId, endpoint, method: "POST", statusCode: 200, requestBody: body, responseBody: resp, ip });
    return NextResponse.json(resp);
  }

  if (!body.guest_name || !Number.isFinite(party) || party <= 0 || !body.starts_at) {
    const missing = {
      guest_name: !body.guest_name,
      party_size: !Number.isFinite(party) || party <= 0,
      starts_at: !body.starts_at,
    };
    const resp = {
      ok: true,
      instruction: "NACHFRAGEN: Es fehlen Pflichtfelder für die Reservierung. Frage den Gast nach Name, Personenzahl und Zeitpunkt. KEINE Reservierung anlegen.",
      missing,
    };
    logVoiceEventAsync({
      restaurantId: auth.restaurantId,
      source: "rest",
      kind: "warning",
      tool: "reservation",
      message: `Reservierungs-Webhook ohne Pflichtfelder (${Object.entries(missing).filter(([, v]) => v).map(([k]) => k).join(", ")})`,
      details: { missing, body },
    });
    await logWebhook({ restaurantId: auth.restaurantId, endpoint, method: "POST", statusCode: 200, requestBody: body, responseBody: resp, ip });
    return NextResponse.json(resp);
  }

  const startsAt = new Date(body.starts_at);
  const admin = createAdminClient();

  const [{ data: tables }, { data: zones }, { data: existing }] = await Promise.all([
    admin.from("tables").select("*").eq("restaurant_id", auth.restaurantId),
    admin.from("zones").select("*").eq("restaurant_id", auth.restaurantId),
    admin.from("reservations").select("*").eq("restaurant_id", auth.restaurantId)
      .gte("starts_at", new Date(startsAt.getTime() - 4 * 3600_000).toISOString())
      .lte("starts_at", new Date(startsAt.getTime() + 4 * 3600_000).toISOString()),
  ]);

  const decision = autoAssign({
    tables: (tables ?? []) as TableRow[],
    zones: (zones ?? []) as Zone[],
    existing: (existing ?? []) as Reservation[],
    partySize: party, startsAt, durationMin,
    preferredZoneName: body.zone ?? null,
    requireAccessible: !!body.accessible,
  });

  const code = await generateUniqueBookingCode(admin, auth.restaurantId);

  const { data: reservation, error } = await admin
    .from("reservations")
    .insert({
      restaurant_id: auth.restaurantId,
      table_id: decision.tableId,
      guest_name: body.guest_name,
      phone: body.phone ?? null,
      email: body.email ?? null,
      party_size: party,
      starts_at: startsAt.toISOString(),
      duration_min: durationMin,
      source: "Voice-KI",
      status: decision.status,
      note: body.note ?? null,
      auto_assigned: decision.autoAssigned,
      approval_reason: decision.approvalReason,
      code,
    })
    .select().single();

  if (error || !reservation) {
    const resp = { error: error?.message ?? "Could not create reservation" };
    logVoiceEventAsync({
      restaurantId: auth.restaurantId,
      source: "rest",
      kind: "error",
      tool: "reservation",
      message: `Reservierung konnte nicht angelegt werden: ${error?.message ?? "unbekannter DB-Fehler"}`,
      details: {
        guest_name: body.guest_name,
        party_size: party,
        starts_at: body.starts_at,
        db_error: error?.message,
      },
    });
    await logWebhook({ restaurantId: auth.restaurantId, endpoint, method: "POST", statusCode: 500, requestBody: body, responseBody: resp, ip });
    return NextResponse.json(resp, { status: 500 });
  }

  if (body.call) {
    await admin.from("voice_calls").insert({
      restaurant_id: auth.restaurantId,
      phone: body.call.phone ?? body.phone ?? null,
      duration_sec: Number(body.call.duration_sec ?? 0),
      outcome: "reservation",
      reservation_id: reservation.id,
      transcript: body.call.transcript ?? [],
      raw_payload: body,
    });
  }

  const assignedTable = decision.tableId
    ? ((tables ?? []) as TableRow[]).find((t) => t.id === decision.tableId)
    : null;
  const zoneName = assignedTable?.zone_id
    ? ((zones ?? []) as Zone[]).find((z) => z.id === assignedTable.zone_id)?.name ?? null
    : null;

  const timeStr = startsAt.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });
  const dateStr = startsAt.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Berlin" });
  const totalTables = ((tables ?? []) as TableRow[]).length;

  let instruction: string;
  if (totalTables === 0) {
    instruction = `ABSAGEN: Es sind keine Tische im System. Keine Reservierung anlegen. Gast zurück an Restaurant verweisen: 07803 926970.`;
  } else if (!assignedTable) {
    instruction = `ABSAGEN: Für ${party} Personen am ${dateStr} um ${timeStr} ist kein Tisch verfügbar. Dem Gast sagen, dass die Reservierung nicht möglich ist.`;
  } else if (decision.status === "Angefragt") {
    instruction = `NOTIEREN: Reservierung vorgemerkt für ${body.guest_name}, ${party} Personen, ${dateStr} ${timeStr}, Bereich ${zoneName}. Sage dem Gast wörtlich: "Alles klar, ich habe Sie notiert — ein Kollege bestätigt Ihnen das zeitnah, Sie bekommen eine kurze Rückmeldung." KEINE feste Zusage geben.`;
  } else {
    instruction = `FERTIG: Reservierung fest für ${body.guest_name}, ${party} Personen, ${dateStr} ${timeStr}, Bereich ${zoneName}. Gast bestätigen: "Perfekt, ich habe Sie fest eingetragen, wir freuen uns auf Sie."`;
  }

  const resp = {
    ok: true,
    reservation_id: reservation.id,
    booking_code: code,
    booking_code_spoken: code ? code.split("").join("-") : null,
    status: decision.status,
    assigned_table: assignedTable
      ? { id: assignedTable.id, label: assignedTable.label, zone: zoneName, seats: assignedTable.seats }
      : null,
    requires_approval: decision.status === "Angefragt",
    approval_reason: decision.approvalReason,
    instruction,
    message: decision.reasonForAI,
  };
  await logWebhook({ restaurantId: auth.restaurantId, endpoint, method: "POST", statusCode: 201, requestBody: body, responseBody: resp, ip });
  if (idemKey) {
    // Erfolgreiche Reservierung cachen — Replays bekommen exakt dieselbe Antwort
    // inklusive booking_code, sodass der Voice-Agent die Nummer korrekt ansagt.
    await storeIdempotency(auth.restaurantId, idemKey, endpoint, 201, resp);
  }
  notifyAsync({
    restaurantId: auth.restaurantId,
    reservationId: reservation.id,
    kind: decision.status === "Angefragt" ? "approval_required" : "confirmed",
  });
  return NextResponse.json(resp, { status: 201 });
}
