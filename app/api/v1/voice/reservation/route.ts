import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { authenticateWebhook, logWebhook } from "@/lib/voice-auth";
import { autoAssign } from "@/lib/assignment";
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
 *   - perfect-fit (party size ≤ seats ≤ party size + 1, zone matches) → auto-confirm
 *   - larger table or wrong zone → create as "Offen" + auto_assigned flag; the owner
 *     sees it in the "Offen" column and must explicitly confirm
 *   - no candidate → unassigned, manual flow
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

  const party = Number(body.party_size);
  const durationMin = Number(body.duration_min ?? 90);
  if (!body.guest_name || !Number.isFinite(party) || party <= 0 || !body.starts_at) {
    const resp = { error: "guest_name, party_size, starts_at required" };
    await logWebhook({ restaurantId: auth.restaurantId, endpoint, method: "POST", statusCode: 400, requestBody: body, responseBody: resp, ip });
    return NextResponse.json(resp, { status: 400 });
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
    })
    .select().single();

  if (error || !reservation) {
    const resp = { error: error?.message ?? "Could not create reservation" };
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

  const resp = {
    ok: true,
    reservation_id: reservation.id,
    status: decision.status,
    assigned_table: assignedTable
      ? { id: assignedTable.id, label: assignedTable.label, zone: zoneName, seats: assignedTable.seats }
      : null,
    requires_approval: decision.autoAssigned && decision.status === "Offen",
    approval_reason: decision.approvalReason,
    message: decision.reasonForAI,
  };
  await logWebhook({ restaurantId: auth.restaurantId, endpoint, method: "POST", statusCode: 201, requestBody: body, responseBody: resp, ip });
  return NextResponse.json(resp, { status: 201 });
}
