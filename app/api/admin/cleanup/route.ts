import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * GET /api/admin/cleanup
 *
 * Auto-cleanup-Endpoint fuer alte Logs. Wird ueber Vercel Cron taeglich
 * angesteuert (siehe vercel.json). Zusaetzlich Bearer-Auth fuer manuelle
 * Aufrufe.
 *
 * Strategie:
 *  - webhook_log: > 30 Tage → loeschen (Webhook-Trace ist nur fuer Debug,
 *    DSGVO-relevant ueberfaellig).
 *  - voice_events: > 90 Tage → loeschen (Errors ueber 3 Monate sind kalt).
 *
 * Auth (drei akzeptierte Wege, Vercel Cron nutzt den Header):
 *  1. `Authorization: Bearer ${CRON_SECRET}` — Vercel Cron sendet das automatisch.
 *  2. `?secret=${CRON_SECRET}` — fuer Browser/Curl-Tests.
 *  3. Vercel Cron Header `x-vercel-cron: 1` (Vercel signalisiert Cron-Aufrufe).
 *
 * Ohne CRON_SECRET als env: 401 — kein leiser Public-Endpoint.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WEBHOOK_LOG_TTL_DAYS = 30;
const VOICE_EVENTS_TTL_DAYS = 90;
const IDEMPOTENCY_TTL_HOURS = 24;
const RATE_LIMIT_TTL_HOURS = 1;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured on server" },
      { status: 500 },
    );
  }

  const auth = request.headers.get("authorization");
  const headerOk = auth === `Bearer ${secret}`;
  const url = new URL(request.url);
  const queryOk = url.searchParams.get("secret") === secret;
  const cronHeader = request.headers.get("x-vercel-cron") === "1";

  if (!headerOk && !queryOk && !cronHeader) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = Date.now();
  const webhookCutoff = new Date(now - WEBHOOK_LOG_TTL_DAYS * 86_400_000).toISOString();
  const eventsCutoff = new Date(now - VOICE_EVENTS_TTL_DAYS * 86_400_000).toISOString();
  const idempotencyCutoff = new Date(now - IDEMPOTENCY_TTL_HOURS * 3600_000).toISOString();
  // Rate-Limit-Buckets: alle Eintraege in bucket_minute < now-60min sind tot
  const rateLimitCutoff = Math.floor(Date.now() / 60_000) - 60 * RATE_LIMIT_TTL_HOURS;

  // Wir nutzen .lt() (strictly less than) — die exakte Cutoff-Zeile soll
  // erhalten bleiben falls genau eine Zeile auf der Grenze liegt.
  const [
    { count: webhooksDeleted, error: webhookErr },
    { count: eventsDeleted, error: eventsErr },
    { count: idempotencyDeleted, error: idempotencyErr },
    { count: rateLimitDeleted, error: rateLimitErr },
  ] = await Promise.all([
    admin.from("webhook_log")
      .delete({ count: "exact" })
      .lt("created_at", webhookCutoff),
    admin.from("voice_events")
      .delete({ count: "exact" })
      .lt("created_at", eventsCutoff),
    admin.from("idempotency_log")
      .delete({ count: "exact" })
      .lt("created_at", idempotencyCutoff),
    admin.from("rate_limit_buckets")
      .delete({ count: "exact" })
      .lt("bucket_minute", rateLimitCutoff),
  ]);

  const result = {
    ok: !webhookErr && !eventsErr,
    cleaned_at: new Date().toISOString(),
    webhook_log: {
      deleted: webhooksDeleted ?? 0,
      cutoff: webhookCutoff,
      ttl_days: WEBHOOK_LOG_TTL_DAYS,
      error: webhookErr?.message ?? null,
    },
    voice_events: {
      deleted: eventsDeleted ?? 0,
      cutoff: eventsCutoff,
      ttl_days: VOICE_EVENTS_TTL_DAYS,
      // voice_events Tabelle koennte fehlen wenn Migration 0011 nicht
      // eingespielt — nicht als Hard-Error werten
      error: eventsErr?.message ?? null,
    },
    idempotency_log: {
      deleted: idempotencyDeleted ?? 0,
      cutoff: idempotencyCutoff,
      ttl_hours: IDEMPOTENCY_TTL_HOURS,
      error: idempotencyErr?.message ?? null,
    },
    rate_limit_buckets: {
      deleted: rateLimitDeleted ?? 0,
      cutoff_minute: rateLimitCutoff,
      ttl_hours: RATE_LIMIT_TTL_HOURS,
      error: rateLimitErr?.message ?? null,
    },
  };

  return NextResponse.json(result, {
    status: webhookErr ? 500 : 200,
    headers: { "Cache-Control": "no-store" },
  });
}
