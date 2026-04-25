import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";
import { dailyDigestTemplate, type DailyDigestStats, type ReservationLite, type EmailTemplateContext } from "@/lib/email-templates";

/**
 * GET /api/admin/daily-digest
 *
 * Wird vom Vercel-Cron jeden Morgen um 7 Uhr Berlin (= 5 UTC im Sommer,
 * 6 UTC im Winter) angetriggert. Schickt jedem Restaurant mit aktivierter
 * `daily_digest`-Setting + hinterlegter Email eine Tagesuebersicht.
 *
 * Auth wie /api/admin/cleanup: Bearer CRON_SECRET, ?secret=, oder
 * x-vercel-cron-Header. Kein leiser Public-Endpoint.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3030");

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
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

  // Berlin-Datum heute (00:00) und Endzeit heute Abend (23:59:59)
  const todayBerlin = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date()); // YYYY-MM-DD

  // Berlin-Tagesfenster als ISO bauen (UTC). Wir nehmen die UTC-Grenzen
  // grosszuegig: from = today 00:00 Berlin (UTC-1 oder UTC-2 je nach DST),
  // to = today 23:59:59 Berlin. parseInBerlin geht das ueber Date-String-API.
  const dayStart = new Date(`${todayBerlin}T00:00:00+02:00`);  // pragma: liefert ggf. mit DST-Drift; fuer Stats reicht es
  const dayEnd   = new Date(`${todayBerlin}T23:59:59+02:00`);

  // Alle Restaurants mit Notify-Settings holen
  const { data: settingsList } = await admin
    .from("settings")
    .select("restaurant_id, notify, branding");

  type SettingsRow = {
    restaurant_id: string;
    notify: { email: string | null; daily_digest: boolean } | null;
    branding: { public_name: string | null; primary_color: string | null } | null;
  };

  const targets = ((settingsList ?? []) as SettingsRow[]).filter((s) =>
    !!s.notify?.daily_digest && !!s.notify?.email?.trim()
  );

  if (targets.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, skipped: "no recipients" });
  }

  const results: { restaurant_id: string; ok: boolean; error?: string }[] = [];

  for (const t of targets) {
    try {
      // Stats parallel laden — pro Tenant separat damit RLS nicht greift
      // (Service-Role tut sowieso nichts, aber explicit ist hier sicherer)
      const [
        { data: reservations },
        { count: voiceCallsToday },
        { data: voiceCallsRows },
        { data: restaurantRow },
      ] = await Promise.all([
        admin.from("reservations").select("*")
          .eq("restaurant_id", t.restaurant_id)
          .gte("starts_at", dayStart.toISOString())
          .lte("starts_at", dayEnd.toISOString())
          .order("starts_at"),
        admin.from("voice_calls").select("*", { count: "exact", head: true })
          .eq("restaurant_id", t.restaurant_id)
          .gte("started_at", dayStart.toISOString()),
        admin.from("voice_calls").select("outcome")
          .eq("restaurant_id", t.restaurant_id)
          .gte("started_at", dayStart.toISOString()),
        admin.from("restaurants").select("name")
          .eq("id", t.restaurant_id).maybeSingle(),
      ]);

      const allRes = (reservations ?? []) as any[];
      const active = allRes.filter((r) => r.status !== "Storniert" && r.status !== "No-Show");
      const guestsTotal = active.reduce((s, r) => s + r.party_size, 0);
      const noShows = allRes.filter((r) => r.status === "No-Show").length;
      const pendingApprovals = allRes.filter((r) => r.status === "Angefragt").length;
      const calls = (voiceCallsRows ?? []) as { outcome: string }[];
      const converted = calls.filter((c) => c.outcome === "reservation").length;

      // Top 5 anstehende
      const now = Date.now();
      const upcomingRaw = active
        .filter((r) => new Date(r.starts_at).getTime() >= now - 5 * 60_000)
        .slice(0, 5);

      // Tische + Zonen fuer Labels (in einem Rutsch)
      const tableIds = upcomingRaw.map((r) => r.table_id).filter(Boolean) as string[];
      const tableMap = new Map<string, { label: string; zone_id: string | null }>();
      const zoneMap = new Map<string, string>();
      if (tableIds.length > 0) {
        const { data: tables } = await admin.from("tables")
          .select("id, label, zone_id").in("id", tableIds);
        for (const tbl of (tables ?? []) as any[]) {
          tableMap.set(tbl.id, { label: tbl.label, zone_id: tbl.zone_id });
        }
        const zoneIds = [...tableMap.values()].map((v) => v.zone_id).filter(Boolean) as string[];
        if (zoneIds.length > 0) {
          const { data: zones } = await admin.from("zones")
            .select("id, name").in("id", zoneIds);
          for (const z of (zones ?? []) as any[]) zoneMap.set(z.id, z.name);
        }
      }

      const upcoming: ReservationLite[] = upcomingRaw.map((r) => {
        const tbl = r.table_id ? tableMap.get(r.table_id) : null;
        return {
          id: r.id,
          guest_name: r.guest_name,
          party_size: r.party_size,
          starts_at: r.starts_at,
          duration_min: r.duration_min,
          source: r.source,
          code: r.code ?? null,
          table_label: tbl?.label ?? null,
          zone: tbl?.zone_id ? zoneMap.get(tbl.zone_id) ?? null : null,
        };
      });

      const stats: DailyDigestStats = {
        date: todayBerlin,
        reservations_total: active.length,
        guests_total: guestsTotal,
        voice_calls_today: voiceCallsToday ?? 0,
        voice_calls_converted: converted,
        no_shows: noShows,
        pending_approvals: pendingApprovals,
        upcoming,
      };

      const restaurantName =
        t.branding?.public_name?.trim() ||
        (restaurantRow as any)?.name ||
        "Ihr Restaurant";

      const ctx: EmailTemplateContext = {
        restaurantName,
        primaryColor: t.branding?.primary_color ?? null,
        appUrl: APP_URL,
      };

      const tpl = dailyDigestTemplate(stats, ctx);
      const sendResult = await sendEmail({
        to: t.notify!.email!,
        subject: tpl.subject,
        html: tpl.html,
        text: tpl.text,
        tags: [
          { name: "kind", value: "daily_digest" },
          { name: "restaurant_id", value: t.restaurant_id },
        ],
      });
      results.push({
        restaurant_id: t.restaurant_id,
        ok: sendResult.ok,
        error: sendResult.error,
      });
    } catch (err: any) {
      results.push({
        restaurant_id: t.restaurant_id,
        ok: false,
        error: err?.message ?? String(err),
      });
    }
  }

  const sent = results.filter((r) => r.ok).length;
  return NextResponse.json({
    ok: true,
    date: todayBerlin,
    targets: targets.length,
    sent,
    failed: results.filter((r) => !r.ok),
  });
}
