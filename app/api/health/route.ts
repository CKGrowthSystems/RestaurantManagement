import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * GET /api/health
 *
 * Public health-check endpoint fuer Uptime-Monitore (UptimeRobot, BetterStack,
 * Pingdom etc.). Antwortet:
 *   200 → { ok: true, db: "ok", db_latency_ms, build, uptime_s, ts }
 *   503 → { ok: false, db: "down", error }
 *
 * Sicherheits-Hinweis:
 *  - Kein Auth: Uptime-Services brauchen public access.
 *  - Leakt keine Tenant-Daten: nur ob die DB erreichbar ist.
 *  - Leakt keine Secrets oder Connection-Strings.
 *
 * Cache: explicit `no-store` damit der Monitor immer eine frische Antwort
 * bekommt.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STARTED_AT = Date.now();
const BUILD =
  process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ??
  process.env.NEXT_PUBLIC_BUILD_SHA ??
  "dev";

export async function GET() {
  const ts = new Date().toISOString();
  const uptimeS = Math.round((Date.now() - STARTED_AT) / 1000);

  // DB-Ping: Count auf restaurants (Head-Only Query, super billig).
  const dbStart = Date.now();
  let dbOk = false;
  let dbError: string | null = null;
  try {
    const admin = createAdminClient();
    const { error } = await admin
      .from("restaurants")
      .select("*", { count: "exact", head: true })
      .limit(1);
    if (error) {
      dbError = error.message;
    } else {
      dbOk = true;
    }
  } catch (err: any) {
    dbError = err?.message ?? String(err);
  }
  const dbLatencyMs = Date.now() - dbStart;

  const body = {
    ok: dbOk,
    db: dbOk ? "ok" : "down",
    db_latency_ms: dbLatencyMs,
    db_error: dbError,
    build: BUILD,
    uptime_s: uptimeS,
    ts,
  };

  return NextResponse.json(body, {
    status: dbOk ? 200 : 503,
    headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
  });
}
