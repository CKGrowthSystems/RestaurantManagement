import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { getWhatsAppCredentials, sendWhatsAppTemplate, normalizePhoneE164 } from "@/lib/whatsapp";
import { confirmationParams } from "@/lib/whatsapp-templates";

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

  const creds = await getWhatsAppCredentials(ctx.restaurantId);
  if (!creds) {
    return NextResponse.json({
      ok: false,
      error: "WhatsApp ist nicht konfiguriert oder deaktiviert. Bitte erst Settings ausfuellen.",
    }, { status: 400 });
  }

  // Restaurant-Name fuer das Template
  const { data: restaurantRow } = await ctx.supabase
    .from("restaurants").select("name").eq("id", ctx.restaurantId).maybeSingle();
  const { data: settingsRow } = await ctx.supabase
    .from("settings").select("branding").eq("restaurant_id", ctx.restaurantId).maybeSingle();
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

  const result = await sendWhatsAppTemplate(creds, {
    to,
    template: creds.templates.confirmation,
    parameters: confirmationParams(testRes, { name: restaurantName }),
  });

  if (!result.ok) {
    return NextResponse.json({
      ok: false,
      error: result.error ?? result.reason ?? "unknown",
    }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    message_id: result.message_id,
    sent_to: to,
    template_used: creds.templates.confirmation,
  });
}
