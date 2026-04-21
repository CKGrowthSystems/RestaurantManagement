import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { authenticateWebhook, logWebhook } from "@/lib/voice-auth";

/**
 * POST /api/v1/voice/cancel
 *
 * Body:
 *   { "reservation_id": "..." }
 *   OR
 *   { "phone": "+49...", "starts_at": "2026-04-24T19:30:00+02:00" }
 */
export async function POST(request: Request) {
  const auth = await authenticateWebhook(request);
  const body = await request.json().catch(() => ({}));
  const endpoint = "/api/v1/voice/cancel";
  const ip = request.headers.get("x-forwarded-for");
  if ("error" in auth) {
    await logWebhook({ restaurantId: null, endpoint, method: "POST", statusCode: auth.status, requestBody: body, responseBody: { error: auth.error }, ip });
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const admin = createAdminClient();
  let query = admin.from("reservations").update({ status: "Storniert" })
    .eq("restaurant_id", auth.restaurantId);

  if (body.reservation_id) {
    query = query.eq("id", body.reservation_id);
  } else if (body.phone && body.starts_at) {
    const start = new Date(body.starts_at);
    const from = new Date(start.getTime() - 30 * 60_000).toISOString();
    const to = new Date(start.getTime() + 30 * 60_000).toISOString();
    query = query.eq("phone", body.phone).gte("starts_at", from).lte("starts_at", to);
  } else {
    const resp = { ok: true, test: true, message: "Endpoint erreichbar. Für echte Stornos: reservation_id oder (phone + starts_at) mitgeben." };
    await logWebhook({ restaurantId: auth.restaurantId, endpoint, method: "POST", statusCode: 200, requestBody: body, responseBody: resp, ip });
    return NextResponse.json(resp);
  }

  const { data, error } = await query.select();
  if (error) {
    await logWebhook({ restaurantId: auth.restaurantId, endpoint, method: "POST", statusCode: 500, requestBody: body, responseBody: { error: error.message }, ip });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const resp = { ok: true, cancelled: data?.length ?? 0 };
  await logWebhook({ restaurantId: auth.restaurantId, endpoint, method: "POST", statusCode: 200, requestBody: body, responseBody: resp, ip });
  return NextResponse.json(resp);
}
