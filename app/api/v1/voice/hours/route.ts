import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { authenticateWebhook, logWebhook } from "@/lib/voice-auth";

/**
 * GET /api/v1/voice/hours — returns opening hours (by weekday) so the AI can
 * answer "Wie lange habt ihr auf?"
 */
export async function GET(request: Request) {
  const auth = await authenticateWebhook(request);
  const endpoint = "/api/v1/voice/hours";
  const ip = request.headers.get("x-forwarded-for");
  if ("error" in auth) {
    await logWebhook({ restaurantId: null, endpoint, method: "GET", statusCode: auth.status, requestBody: null, responseBody: { error: auth.error }, ip });
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const admin = createAdminClient();
  const { data } = await admin
    .from("settings")
    .select("opening_hours")
    .eq("restaurant_id", auth.restaurantId)
    .maybeSingle();

  const resp = { hours: data?.opening_hours ?? null, timezone: auth.timezone };
  await logWebhook({ restaurantId: auth.restaurantId, endpoint, method: "GET", statusCode: 200, requestBody: null, responseBody: resp, ip });
  return NextResponse.json(resp);
}
