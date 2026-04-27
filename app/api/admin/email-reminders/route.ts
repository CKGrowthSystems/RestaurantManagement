import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";
import { renderGuestEmail } from "@/lib/guest-email-template";
import { parseFirstName } from "@/lib/ghl-webhook";
import type { MessageVars } from "@/lib/message-vars";

/**
 * GET /api/admin/email-reminders
 *
 * Pendant zu /api/admin/whatsapp-reminders, nur für Email-Erinnerungen an
 * Gäste. Wird taeglich per Vercel-Cron getriggert. Sucht alle bestaetigten
 * Reservierungen die innerhalb des Tenant-Cutoffs anstehen UND eine Email
 * hinterlegt haben UND noch keinen Reminder bekommen haben.
 *
 * Auth: gleicher CRON_SECRET-Mechanismus wie cleanup.
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

  // Tenants mit aktiver Guest-Email-Konfig + Reminder > 0
  const { data: settingsList } = await admin
    .from("settings")
    .select("restaurant_id, guest_email, branding");

  type Row = {
    restaurant_id: string;
    guest_email: any;
    branding: any;
  };
  const targets = ((settingsList ?? []) as Row[]).filter((s) => {
    const cfg = s.guest_email;
    return cfg?.enabled
      && typeof cfg?.send_reminder_hours_before === "number"
      && cfg.send_reminder_hours_before > 0;
  });

  if (targets.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, skipped: "no email tenants with reminder enabled" });
  }

  const now = Date.now();
  const results: { restaurant_id: string; sent: number; failed: number; errors?: string[] }[] = [];

  for (const t of targets) {
    const hoursBefore = t.guest_email.send_reminder_hours_before as number;
    const cutoffStart = new Date(now);
    const cutoffEnd = new Date(now + hoursBefore * 3600_000);

    const { data: restaurantRow } = await admin.from("restaurants")
      .select("name").eq("id", t.restaurant_id).maybeSingle();
    const restaurantName =
      t.branding?.public_name?.trim() ||
      (restaurantRow as any)?.name ||
      "Restaurant";

    // Email-Reminder: Reservation muss email haben (statt phone)
    const { data: due } = await admin.from("reservations")
      .select("id, guest_name, party_size, starts_at, code, email")
      .eq("restaurant_id", t.restaurant_id)
      .in("status", ["Bestätigt", "Eingetroffen"])
      .gte("starts_at", cutoffStart.toISOString())
      .lte("starts_at", cutoffEnd.toISOString())
      .is("reminder_sent_at", null)
      .not("email", "is", null)
      .neq("whatsapp_consent", false);   // gleicher Consent-Flag deckt beide Channels ab

    const list = (due ?? []) as {
      id: string; guest_name: string; party_size: number;
      starts_at: string; code: string | null; email: string;
    }[];

    if (list.length === 0) {
      results.push({ restaurant_id: t.restaurant_id, sent: 0, failed: 0 });
      continue;
    }

    let sent = 0, failed = 0;
    const errors: string[] = [];

    for (const r of list) {
      const startsAtDate = new Date(r.starts_at);
      const dateHuman = startsAtDate.toLocaleDateString("de-DE", {
        weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Berlin",
      });
      const timeHuman = startsAtDate.toLocaleTimeString("de-DE", {
        hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin",
      });
      const vars: MessageVars = {
        name: parseFirstName(r.guest_name),
        restaurant: restaurantName,
        code: r.code ?? "",
        date: dateHuman,
        time: timeHuman,
        party: r.party_size,
      };

      const tpl = renderGuestEmail("reminder", vars, t.guest_email.custom_messages, {
        restaurantName,
        primaryColor: t.branding?.primary_color ?? null,
      });

      const result = await sendEmail({
        to: r.email,
        subject: tpl.subject,
        html: tpl.html,
        text: tpl.text,
        tags: [
          { name: "kind", value: "guest_reminder" },
          { name: "restaurant_id", value: t.restaurant_id },
        ],
      });

      if (result.ok) {
        sent++;
        await admin.from("reservations")
          .update({ reminder_sent_at: new Date().toISOString() })
          .eq("id", r.id)
          .eq("restaurant_id", t.restaurant_id);
      } else {
        failed++;
        errors.push(`${r.id}: ${result.error ?? "unknown"}`);
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
