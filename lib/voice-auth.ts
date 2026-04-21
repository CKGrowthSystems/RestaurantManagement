import { createAdminClient } from "./supabase/server";
import { isDemoMode } from "./env";
import { DEMO_RESTAURANT_ID } from "./demo-store";

export interface AuthedTenant {
  restaurantId: string;
  timezone: string;
  locale: string;
}

export async function authenticateWebhook(request: Request): Promise<AuthedTenant | { error: string; status: number }> {
  if (isDemoMode()) {
    return { restaurantId: DEMO_RESTAURANT_ID, timezone: "Europe/Berlin", locale: "de-DE" };
  }

  const secret =
    request.headers.get("x-webhook-secret") ??
    request.headers.get("X-Webhook-Secret") ??
    new URL(request.url).searchParams.get("secret");

  if (!secret) return { error: "Missing X-Webhook-Secret header", status: 401 };

  // Accept the global VOICE_WEBHOOK_SECRET env (used when a customer has one shared secret)
  // or a per-restaurant secret stored in restaurants.webhook_secret.
  const admin = createAdminClient();

  if (process.env.VOICE_WEBHOOK_SECRET && secret === process.env.VOICE_WEBHOOK_SECRET) {
    // Global secret — caller must pass ?restaurant=<id> or X-Restaurant-Id header.
    const rid =
      request.headers.get("x-restaurant-id") ??
      new URL(request.url).searchParams.get("restaurant");
    if (!rid) return { error: "X-Restaurant-Id required with global secret", status: 400 };
    const { data } = await admin.from("restaurants").select("id, timezone, locale").eq("id", rid).maybeSingle();
    if (!data) return { error: "Restaurant not found", status: 404 };
    return { restaurantId: data.id, timezone: data.timezone, locale: data.locale };
  }

  const { data } = await admin
    .from("restaurants")
    .select("id, timezone, locale, webhook_secret")
    .eq("webhook_secret", secret)
    .maybeSingle();
  if (!data) return { error: "Invalid webhook secret", status: 401 };
  return { restaurantId: data.id, timezone: data.timezone, locale: data.locale };
}

export async function logWebhook(params: {
  restaurantId: string | null;
  endpoint: string;
  method: string;
  statusCode: number;
  requestBody: unknown;
  responseBody: unknown;
  ip?: string | null;
}) {
  const admin = createAdminClient();
  await admin.from("webhook_log").insert({
    restaurant_id: params.restaurantId,
    endpoint: params.endpoint,
    method: params.method,
    status_code: params.statusCode,
    request_body: params.requestBody as any,
    response_body: params.responseBody as any,
    ip: params.ip ?? null,
  });
}
