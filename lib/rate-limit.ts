/**
 * Rate-Limit-Helper
 * ==================
 *
 * Postgres-basiert (siehe Migration 0013). Sliding-Window mit 60s-Buckets.
 * Aktiv pro restaurant_id, damit ein Tenant nicht durch Floods anderer
 * Tenants beeintraechtigt wird.
 *
 * Default-Quotas (siehe RATE_LIMITS):
 *  - mcp:        120 req/min  pro Restaurant — viele JSON-RPC-Roundtrips pro Anruf
 *  - voice_rest:  60 req/min  pro Restaurant — REST-Calls vom Voice-Agent
 *  - voice_call:  20 calls/min pro Restaurant — physische Anrufe (start_call etc.)
 *
 * Best-Effort: Failt der Postgres-Call (z.B. Migration nicht eingespielt),
 * lassen wir den Request DURCH. Lieber kein Rate-Limit als ein 500er der
 * legitime Voice-Anrufe blockiert.
 */

import { createAdminClient } from "@/lib/supabase/server";

export type RateLimitResult = {
  allowed: boolean;
  currentCount: number;
  limit: number;
  retryAfterSeconds: number;
};

export const RATE_LIMITS = {
  mcp: 120,
  voice_rest: 60,
  voice_call: 20,
} as const;

export type RateLimitBucket = keyof typeof RATE_LIMITS;

export async function checkRateLimit(
  bucket: RateLimitBucket,
  restaurantId: string,
  limitOverride?: number,
): Promise<RateLimitResult> {
  const limit = limitOverride ?? RATE_LIMITS[bucket];
  const key = `${bucket}:${restaurantId}`;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("incr_rate_limit", {
      p_key: key,
      p_max: limit,
    });
    if (error || !Array.isArray(data) || !data[0]) {
      // Migration evtl. nicht eingespielt — wir lassen den Request durch.
      // Best-Effort: keine Hard-Errors auf dem Hot-Path.
      if (error) console.warn("[rate-limit] rpc failed:", error.message);
      return { allowed: true, currentCount: 0, limit, retryAfterSeconds: 0 };
    }
    const row = data[0] as { allowed: boolean; current_count: number };
    return {
      allowed: row.allowed,
      currentCount: row.current_count,
      limit,
      // 60s ist die Bucket-Groesse — bis zur naechsten Minute warten reicht
      retryAfterSeconds: row.allowed ? 0 : 60,
    };
  } catch (err) {
    console.warn("[rate-limit] unexpected error:", err);
    return { allowed: true, currentCount: 0, limit, retryAfterSeconds: 0 };
  }
}

/**
 * Bequeme Helper: gibt ein NextResponse-kompatibles 429-Body zurueck wenn
 * blockiert. `null` wenn der Request durchgehen darf.
 */
export function rateLimitResponse(result: RateLimitResult): {
  body: { error: string; limit: number; retry_after_seconds: number };
  headers: Record<string, string>;
} | null {
  if (result.allowed) return null;
  return {
    body: {
      error: "Rate limit exceeded",
      limit: result.limit,
      retry_after_seconds: result.retryAfterSeconds,
    },
    headers: {
      "Retry-After": String(result.retryAfterSeconds),
      "X-RateLimit-Limit": String(result.limit),
      "X-RateLimit-Remaining": "0",
    },
  };
}
