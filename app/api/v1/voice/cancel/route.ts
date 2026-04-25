import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { authenticateWebhook, logWebhook } from "@/lib/voice-auth";
import { logVoiceEventAsync } from "@/lib/voice-events";
import { readIdempotencyKey, checkIdempotency, storeIdempotency } from "@/lib/idempotency";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

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

  // Rate-Limit
  const rl = await checkRateLimit("voice_rest", auth.restaurantId);
  const rlResp = rateLimitResponse(rl);
  if (rlResp) {
    logVoiceEventAsync({
      restaurantId: auth.restaurantId,
      source: "rest",
      kind: "warning",
      tool: "cancel",
      message: `Rate-Limit auf /cancel erreicht: ${rl.currentCount}/${rl.limit} in 60s`,
      details: { limit: rl.limit, current: rl.currentCount },
    });
    await logWebhook({ restaurantId: auth.restaurantId, endpoint, method: "POST", statusCode: 429, requestBody: body, responseBody: rlResp.body, ip });
    return NextResponse.json(rlResp.body, { status: 429, headers: rlResp.headers });
  }

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
    logVoiceEventAsync({
      restaurantId: auth.restaurantId,
      source: "rest",
      kind: "error",
      tool: "cancel",
      message: `Storno fehlgeschlagen: ${error.message}`,
      details: { body, db_error: error.message },
    });
    await logWebhook({ restaurantId: auth.restaurantId, endpoint, method: "POST", statusCode: 500, requestBody: body, responseBody: { error: error.message }, ip });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const cancelled = data?.length ?? 0;
  if (cancelled === 0 && (body.reservation_id || (body.phone && body.starts_at))) {
    logVoiceEventAsync({
      restaurantId: auth.restaurantId,
      source: "rest",
      kind: "warning",
      tool: "cancel",
      message: `Storno-Anfrage ohne Treffer (Phone: ${body.phone ?? "—"}, Zeit: ${body.starts_at ?? body.reservation_id ?? "—"})`,
      details: { body },
    });
  }
  const resp = { ok: true, cancelled };
  await logWebhook({ restaurantId: auth.restaurantId, endpoint, method: "POST", statusCode: 200, requestBody: body, responseBody: resp, ip });
  // Nur erfolgreiche Stornos cachen (cancelled > 0). „Nichts gefunden" sollte
  // nicht persistent sein — falls die Reservierung nachtraeglich angelegt wird,
  // soll ein Retry sie storno-en koennen.
  if (idemKey && cancelled > 0) {
    await storeIdempotency(auth.restaurantId, idemKey, endpoint, 200, resp);
  }
  return NextResponse.json(resp);
}
