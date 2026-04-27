import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { sendEmail, isEmailEnabled } from "@/lib/email";
import { renderGuestEmail } from "@/lib/guest-email-template";
import type { MessageVars } from "@/lib/message-vars";

/**
 * POST /api/guest-email/test-send
 * Body: { to: "test@example.com" }
 *
 * Sendet eine Test-Bestätigungsmail an die angegebene Adresse mit den
 * Tenant-eigenen Custom-Messages + Branding. Nutzt die GLEICHE Pipeline
 * wie der echte Versand bei einer Reservierung — wenn das hier klappt,
 * klappt's auch bei einer echten Buchung.
 *
 * Falls RESEND_API_KEY/RESEND_FROM nicht gesetzt sind, gibt der Endpoint
 * einen klaren Fehler zurueck damit das UI das anzeigen kann.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  if (!isEmailEnabled()) {
    return NextResponse.json({
      ok: false,
      error: "Email-Versand ist auf dem Server nicht konfiguriert. RESEND_API_KEY und RESEND_FROM muessen als Vercel ENV-Variablen gesetzt sein.",
    }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const to = String(body.to ?? "").trim();
  if (!to || !to.includes("@")) {
    return NextResponse.json({
      ok: false,
      error: "Ungueltige Email-Adresse. Format: name@domain.de",
    }, { status: 400 });
  }

  // Settings + Branding fuer Templates laden
  const { data: settingsRow } = await ctx.supabase
    .from("settings").select("guest_email, branding").eq("restaurant_id", ctx.restaurantId).maybeSingle();
  const ge = (settingsRow as any)?.guest_email as any;
  if (!ge?.enabled) {
    return NextResponse.json({
      ok: false,
      error: "Email-Versand an Gaeste ist in den Settings deaktiviert. Bitte erst aktivieren.",
    }, { status: 400 });
  }

  const { data: restaurantRow } = await ctx.supabase
    .from("restaurants").select("name").eq("id", ctx.restaurantId).maybeSingle();
  const restaurantName =
    (settingsRow?.branding as any)?.public_name?.trim() ||
    (restaurantRow as any)?.name ||
    "Restaurant";

  // Test-Reservation: heute Abend 19:30, fake guest
  const testStart = new Date();
  testStart.setHours(19, 30, 0, 0);
  const dateHuman = testStart.toLocaleDateString("de-DE", {
    weekday: "long", day: "numeric", month: "long",
    timeZone: "Europe/Berlin",
  });
  const timeHuman = testStart.toLocaleTimeString("de-DE", {
    hour: "2-digit", minute: "2-digit",
    timeZone: "Europe/Berlin",
  });
  const vars: MessageVars = {
    name: "Test-Gast",
    restaurant: restaurantName,
    code: "00000",
    date: dateHuman,
    time: timeHuman,
    party: 2,
  };

  const tpl = renderGuestEmail("confirmed", vars, ge.custom_messages, {
    restaurantName,
    primaryColor: (settingsRow?.branding as any)?.primary_color ?? null,
  });

  const result = await sendEmail({
    to,
    subject: `[TEST] ${tpl.subject}`,
    html: tpl.html,
    text: tpl.text,
    tags: [
      { name: "kind", value: "test_guest_email" },
      { name: "restaurant_id", value: ctx.restaurantId },
    ],
  });

  if (!result.ok) {
    return NextResponse.json({
      ok: false,
      error: result.error ?? "Unbekannter Fehler beim Versand",
    }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    sent_to: to,
    message_id: result.id,
    note: "Test-Mail wurde an Resend uebergeben. Pruefe deinen Posteingang (auch Spam-Ordner).",
  });
}
