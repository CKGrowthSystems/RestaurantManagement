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
  if (!Number.isFinite(party) || party <= 0 || !startsAtRaw) {
    // Leer/Test-Ping von GHL → 200 statt 400, damit „Test Webhook" grün wird.
    const resp = { ok: true, test: true, message: "Endpoint erreichbar. Für echte Abfragen: party_size + starts_at mitgeben." };
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

  const resp = {
    available: ranked.length > 0,
    slot: { starts_at: startsAt.toISOString(), duration_min: durationMin },
    best: ranked[0] ? mapCand(ranked[0]) : null,
    candidates: ranked.slice(0, 5).map(mapCand),
  };

  await logWebhook({ restaurantId: auth.restaurantId, endpoint, method: "POST", statusCode: 200, requestBody: body, responseBody: resp, ip });
  return NextResponse.json(resp);
}
