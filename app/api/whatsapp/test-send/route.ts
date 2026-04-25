import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { getWhatsAppCredentials, sendWhatsAppTemplate, normalizePhoneE164 } from "@/lib/whatsapp";
import { confirmationParams } from "@/lib/whatsapp-templates";
import { sendGhlWebhook, parseFirstName, type GhlWebhookPayload } from "@/lib/ghl-webhook";

/**
 * POST /api/whatsapp/test-send
 * Body: { to: "+4915112345678" }
 *
 * Sendet eine Test-Bestaetigungsmail an die im Body angegebene Nummer mit
 * den Tenant-eigenen WhatsApp-Credentials. So kann das Restaurant in den
 * Settings einmal pruefen ob alles funktioniert, bevor scharfgeschaltet
 * wird.
 *
 * Tenant-Context ueber Browser-Session, RLS-isoliert.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const to = normalizePhoneE164(body.to);
  if (!to) {
    return NextResponse.json({
      ok: false,
      error: "Invalid phone number. Format: +49 151 ... oder 0151 ...",
    }, { status: 400 });
  }

  // Settings laden um den Provider zu ermitteln
  const { data: settingsRow } = await ctx.supabase
    .from("settings").select("branding, whatsapp").eq("restaurant_id", ctx.restaurantId).maybeSingle();
  const wa = (settingsRow as any)?.whatsapp as any;
  if (!wa || !wa.enabled) {
    return NextResponse.json({
      ok: false,
      error: "WhatsApp ist deaktiviert. Bitte erst aktivieren und Provider konfigurieren.",
    }, { status: 400 });
  }

  // Restaurant-Name fuer das Template / Payload
  const { data: restaurantRow } = await ctx.supabase
    .from("restaurants").select("name").eq("id", ctx.restaurantId).maybeSingle();
  const restaurantName =
    (settingsRow?.branding as any)?.public_name?.trim() ||
    (restaurantRow as any)?.name ||
    "Restaurant";

  // Test-Reservation bauen — heute Abend 19:30, fake guest
  const testStart = new Date();
  testStart.setHours(19, 30, 0, 0);
  const testRes = {
    guest_name: "Test-Gast",
    party_size: 2,
    starts_at: testStart.toISOString(),
    code: "00000",
  };

  const provider: "ghl" | "meta" = wa.provider ?? (wa.ghl_webhook_url ? "ghl" : "meta");

  if (provider === "ghl") {
    if (!wa.ghl_webhook_url) {
      return NextResponse.json({ ok: false, error: "GHL-Webhook-URL nicht gesetzt" }, { status: 400 });
    }
    const startsAtDate = new Date(testRes.starts_at);
    const dateHuman = startsAtDate.toLocaleDateString("de-DE", {
      weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Berlin",
    });
    const timeHuman = startsAtDate.toLocaleTimeString("de-DE", {
      hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin",
    });
    const payload: GhlWebhookPayload = {
      event: "confirmed",
      channel: "whatsapp",
      to,
      guest_name: testRes.guest_name,
      guest_first_name: parseFirstName(testRes.guest_name),
      party_size: testRes.party_size,
      starts_at: testRes.starts_at,
      date: dateHuman,
      time: timeHuman,
      starts_at_human: `${dateHuman}, ${timeHuman} Uhr`,
      code: testRes.code,
      restaurant_name: restaurantName,
      reservation_id: "test-" + Math.random().toString(36).slice(2, 9),
    };
    const result = await sendGhlWebhook(wa.ghl_webhook_url, payload);
    if (!result.ok) {
      return NextResponse.json({ ok: false, provider: "ghl", error: result.error }, { status: 400 });
    }
    return NextResponse.json({
      ok: true,
      provider: "ghl",
      sent_to: to,
      ghl_status: result.status,
      note: "GHL-Webhook hat 2xx geliefert. Ob die WhatsApp wirklich rausgegangen ist, siehst du in deinem GHL-Workflow-Log.",
    });
  }

  // Meta-direct
  const creds = await getWhatsAppCredentials(ctx.restaurantId);
  if (!creds) {
    return NextResponse.json({
      ok: false,
      error: "Meta-Credentials fehlen. Bitte Phone-ID + Token ausfuellen.",
    }, { status: 400 });
  }

  const result = await sendWhatsAppTemplate(creds, {
    to,
    template: creds.templates.confirmation,
    parameters: confirmationParams(testRes, { name: restaurantName }),
  });

  if (!result.ok) {
    return NextResponse.json({
      ok: false,
      provider: "meta",
      error: result.error ?? result.reason ?? "unknown",
    }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    provider: "meta",
    message_id: result.message_id,
    sent_to: to,
    template_used: creds.templates.confirmation,
  });
}
