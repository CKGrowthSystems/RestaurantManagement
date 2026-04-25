/**
 * HTTP-Idempotency-Helper
 * ========================
 *
 * Voice-Agent-Webhooks (GHL) können bei Netzwerk-Glitches denselben POST
 * doppelt senden. Ohne Idempotency wuerde das eine zweite Reservierung
 * anlegen — schlecht. Mit `Idempotency-Key`-Header wird die zweite Anfrage
 * mit der GLEICHEN gespeicherten Antwort beantwortet.
 *
 * Pattern:
 *   const cached = await checkIdempotency(restaurantId, key, endpoint);
 *   if (cached) return NextResponse.json(cached.body, { status: cached.status });
 *   // ... echtes Processing ...
 *   await storeIdempotency(restaurantId, key, endpoint, status, body);
 *
 * TTL: 24h (Cleanup via /api/admin/cleanup-Cron, siehe vercel.json).
 */

import { createAdminClient } from "@/lib/supabase/server";

const IDEMPOTENCY_TTL_MS = 24 * 3600_000;

export type IdempotencyHit = {
  status: number;
  body: unknown;
  cached_at: string;
};

/**
 * Liest den Idempotency-Key aus dem Request-Header. Akzeptiert beide
 * uebliche Schreibweisen.
 */
export function readIdempotencyKey(request: Request): string | null {
  const v = request.headers.get("idempotency-key") ??
            request.headers.get("x-idempotency-key");
  if (!v) return null;
  const trimmed = v.trim();
  // Sanity: keine leeren / zu langen Keys speichern
  if (!trimmed || trimmed.length > 200) return null;
  return trimmed;
}

/**
 * Sucht nach einem cached Response. Null → keiner gespeichert (oder TTL abgelaufen).
 */
export async function checkIdempotency(
  restaurantId: string,
  key: string,
  endpoint: string,
): Promise<IdempotencyHit | null> {
  try {
    const admin = createAdminClient();
    const cutoff = new Date(Date.now() - IDEMPOTENCY_TTL_MS).toISOString();
    const { data, error } = await admin.from("idempotency_log")
      .select("status_code, response, created_at")
      .eq("restaurant_id", restaurantId)
      .eq("key", key)
      .eq("endpoint", endpoint)
      .gte("created_at", cutoff)
      .maybeSingle();
    if (error || !data) return null;
    return {
      status: (data as any).status_code,
      body: (data as any).response,
      cached_at: (data as any).created_at,
    };
  } catch (err) {
    console.warn("[idempotency] check failed:", err);
    return null;
  }
}

/**
 * Speichert eine Antwort fuer 24h. Best-Effort: failt das Insert (z.B. Tabelle
 * fehlt weil Migration nicht eingespielt), wird der Original-Request normal
 * ausgeliefert — Idempotency darf den Hot-Path nie blockieren.
 *
 * Ein UNIQUE-Conflict (selber Key gleichzeitig zweimal eingefuegt = Race) wird
 * geschluckt: das ist genau der Fall fuer den wir das System bauen, der zweite
 * Request darf gerne nichts neues machen.
 */
export async function storeIdempotency(
  restaurantId: string,
  key: string,
  endpoint: string,
  statusCode: number,
  body: unknown,
): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("idempotency_log").insert({
      restaurant_id: restaurantId,
      key,
      endpoint,
      status_code: statusCode,
      response: body,
    });
    if (error && !error.message?.toLowerCase().includes("duplicate")) {
      console.warn("[idempotency] store failed:", error.message);
    }
  } catch (err) {
    console.warn("[idempotency] unexpected error:", err);
  }
}
