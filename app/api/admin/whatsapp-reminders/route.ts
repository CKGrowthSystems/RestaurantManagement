import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getWhatsAppCredentials, sendWhatsAppTemplate, normalizePhoneE164 } from "@/lib/whatsapp";
import { reminderParams } from "@/lib/whatsapp-templates";
import { sendGhlWebhook, parseFirstName, type GhlWebhookPayload } from "@/lib/ghl-webhook";

/**
 * GET /api/admin/whatsapp-reminders
 *
 * Wird vom Vercel-Cron taeglich morgens (06:30 UTC = ~07:30 Berlin im Sommer)
 * angetriggert. Sucht alle bestaetigten Reservierungen die in den naechsten
 * X Stunden anstehen (X je Tenant-Setting, default 24h) UND fuer die noch
 * KEIN Reminder geschickt wurde — und sendet dann pro Reservierung eine
 * WhatsApp-Erinnerung an den Gast.
 *
 * Hinweis: Vercel-Hobby-Plan erlaubt nur tägliche Crons. Pro-Plan kann den
 * Cron auf 15-Minuten-Intervalle setzen — dann waeren auch sub-2h-Reminders
 * moeglich.
 *
 * Wieder-Versand-Schutz: setzt reminder_sent_at auf das Sende-Timestamp,
 * sodass der naechste Cron-Lauf dieselbe Reservierung nicht erneut anfasst.
 *
 * Auth: gleicher CRON_SECRET-Mechanismus wie /api/admin/cleanup.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  // Alle Tenants mit aktiver WhatsApp-Konfig + Reminder-Toggle holen
  const { data: settingsList } = await admin
    .from("settings")
    .select("restaurant_id, whatsapp");

  type WaCfgRow = {
    restaurant_id: string;
    whatsapp: any;
  };
  const targets = ((settingsList ?? []) as WaCfgRow[]).filter((s) => {
    const cfg = s.whatsapp;
    if (!cfg?.enabled) return false;
    if (typeof cfg?.send_reminder_hours_before !== "number" || cfg.send_reminder_hours_before <= 0) return false;
    // Provider-Switch: GHL = nur webhook_url ist Pflicht; Meta = phone+token
    const provider = cfg.provider ?? (cfg.ghl_webhook_url ? "ghl" : "meta");
    if (provider === "ghl") return !!cfg.ghl_webhook_url;
    return !!(cfg.phone_number_id && cfg.access_token);
  });

  if (targets.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, skipped: "no whatsapp tenants with reminder enabled" });
  }

  const now = Date.now();
  const results: { restaurant_id: string; sent: number; failed: number; errors?: string[] }[] = [];

  for (const t of targets) {
    const hoursBefore = t.whatsapp.send_reminder_hours_before as number;
    const cutoffStart = new Date(now);                                        // jetzt: alle die JETZT bis Cutoff anstehen
    const cutoffEnd = new Date(now + hoursBefore * 3600_000);

    // Tenant-Restaurant-Name fuers Template
    const { data: restaurantRow } = await admin.from("restaurants")
      .select("name").eq("id", t.restaurant_id).maybeSingle();
    const { data: settings } = await admin.from("settings")
      .select("branding").eq("restaurant_id", t.restaurant_id).maybeSingle();
    const restaurantName =
      (settings as any)?.branding?.public_name?.trim() ||
      (restaurantRow as any)?.name ||
      "Restaurant";

    const { data: due } = await admin.from("reservations")
      .select("id, guest_name, party_size, starts_at, code, phone")
      .eq("restaurant_id", t.restaurant_id)
      .in("status", ["Bestätigt", "Eingetroffen"])
      .gte("starts_at", cutoffStart.toISOString())
      .lte("starts_at", cutoffEnd.toISOString())
      .is("reminder_sent_at", null)
      .not("phone", "is", null)
      .neq("whatsapp_consent", false);

    const list = (due ?? []) as {
      id: string; guest_name: string; party_size: number;
      starts_at: string; code: string | null; phone: string;
    }[];

    if (list.length === 0) {
      results.push({ restaurant_id: t.restaurant_id, sent: 0, failed: 0 });
      continue;
    }

    const provider: "ghl" | "meta" = t.whatsapp.provider ?? (t.whatsapp.ghl_webhook_url ? "ghl" : "meta");
    const ghlUrl = t.whatsapp.ghl_webhook_url as string | undefined;

    // Meta-Credentials nur laden wenn wir sie wirklich brauchen
    const creds = provider === "meta" ? await getWhatsAppCredentials(t.restaurant_id) : null;
    if (provider === "meta" && !creds) {
      results.push({
        restaurant_id: t.restaurant_id, sent: 0, failed: list.length,
        errors: ["Meta-Credentials nicht ladbar"],
      });
      continue;
    }

    let sent = 0, failed = 0;
    const errors: string[] = [];

    for (const r of list) {
      let result: { ok: boolean; error?: string; reason?: string; skipped?: boolean };

      if (provider === "ghl" && ghlUrl) {
        const to = normalizePhoneE164(r.phone);
        if (!to) {
          result = { ok: false, error: "Invalid phone", skipped: true };
        } else {
          const startsAtDate = new Date(r.starts_at);
          const dateHuman = startsAtDate.toLocaleDateString("de-DE", {
            weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Berlin",
          });
          const timeHuman = startsAtDate.toLocaleTimeString("de-DE", {
            hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin",
          });
          const payload: GhlWebhookPayload = {
            event: "reminder",
            channel: "whatsapp",
            to,
            guest_name: r.guest_name,
            guest_first_name: parseFirstName(r.guest_name),
            party_size: r.party_size,
            starts_at: r.starts_at,
            date: dateHuman,
            time: timeHuman,
            starts_at_human: `${dateHuman}, ${timeHuman} Uhr`,
            code: r.code,
            restaurant_name: restaurantName,
            reservation_id: r.id,
          };
          result = await sendGhlWebhook(ghlUrl, payload);
        }
      } else if (creds) {
        const params = reminderParams(
          { guest_name: r.guest_name, party_size: r.party_size, starts_at: r.starts_at, code: r.code },
          { name: restaurantName },
        );
        result = await sendWhatsAppTemplate(creds, {
          to: r.phone,
          template: creds.templates.reminder,
          parameters: params,
        });
      } else {
        result = { ok: false, error: "No provider configured" };
      }

      if (result.ok) {
        sent++;
        // reminder_sent_at setzen — egal was sonst, wir versuchen es nicht nochmal
        await admin.from("reservations")
          .update({ reminder_sent_at: new Date().toISOString() })
          .eq("id", r.id)
          .eq("restaurant_id", t.restaurant_id);
      } else {
        failed++;
        errors.push(`${r.id}: ${result.error ?? result.reason ?? "unknown"}`);
        // Bei Fehlern auch markieren wenn die Phone offensichtlich Muell ist —
        // sonst probieren wir das in jedem Cron-Lauf erneut.
        if (result.skipped) {
          await admin.from("reservations")
            .update({ reminder_sent_at: new Date().toISOString() })
            .eq("id", r.id)
            .eq("restaurant_id", t.restaurant_id);
        }
      }
    }

    results.push({
      restaurant_id: t.restaurant_id,
      sent, failed,
      errors: errors.length > 0 ? errors : undefined,
    });
  }

  const totalSent = results.reduce((s, r) => s + r.sent, 0);
  const totalFailed = results.reduce((s, r) => s + r.failed, 0);
  return NextResponse.json({
    ok: true,
    ran_at: new Date().toISOString(),
    targets: targets.length,
    sent: totalSent,
    failed: totalFailed,
    results,
  });
}
