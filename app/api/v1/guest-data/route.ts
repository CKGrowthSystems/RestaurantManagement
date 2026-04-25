import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { phonesMatch } from "@/lib/phone";

/**
 * DSGVO-Endpoints fuer Gastdaten
 * ===============================
 *
 * GET    /api/v1/guest-data?phone=<n>     → Auskunftsrecht (Art. 15 DSGVO)
 * DELETE /api/v1/guest-data?phone=<n>     → Recht auf Loeschung (Art. 17 DSGVO)
 *
 * Auth: Browser-Session vom Restaurant-Team (Cookie). RLS via getTenantContext
 * stellt sicher, dass nur Daten des eigenen Tenants raus/weggehen koennen.
 *
 * Loesch-Strategie:
 *  - reservations: guest_name → "[geloescht]", phone/email/note/approval_reason → null.
 *    Reservierung selbst BLEIBT erhalten — Statistik (Auslastung, Umsatz) bleibt
 *    intakt, nur die personenbezogenen Felder sind weg.
 *  - voice_calls: phone → null, transcript → [], raw_payload → null.
 *    Outcome/Dauer/Zeitstempel bleiben fuer Reporting.
 *
 * Match: phonesMatch() (Format-tolerant, last-9-digits).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function readPhoneParam(request: Request): string | null {
  const url = new URL(request.url);
  const phone = url.searchParams.get("phone");
  if (!phone) return null;
  const trimmed = phone.trim();
  return trimmed || null;
}

export async function GET(request: Request) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const phone = readPhoneParam(request);
  if (!phone) return NextResponse.json({ error: "Missing ?phone= parameter" }, { status: 400 });

  const { supabase, restaurantId } = ctx;

  // Wir holen alle Reservierungen + Voice-Calls fuer diesen Tenant und
  // filtern client-seitig via phonesMatch — Format-Toleranz ist nur in JS
  // implementiert, nicht in SQL.
  const [{ data: reservations }, { data: voiceCalls }] = await Promise.all([
    supabase.from("reservations").select("*")
      .eq("restaurant_id", restaurantId)
      .not("phone", "is", null)
      .order("starts_at", { ascending: false }),
    supabase.from("voice_calls").select("*")
      .eq("restaurant_id", restaurantId)
      .not("phone", "is", null)
      .order("started_at", { ascending: false }),
  ]);

  const matchedReservations = ((reservations ?? []) as { phone: string | null }[])
    .filter((r) => phonesMatch(r.phone, phone));
  const matchedCalls = ((voiceCalls ?? []) as { phone: string | null }[])
    .filter((c) => phonesMatch(c.phone, phone));

  return NextResponse.json({
    phone,
    restaurant_id: restaurantId,
    exported_at: new Date().toISOString(),
    reservations_count: matchedReservations.length,
    voice_calls_count: matchedCalls.length,
    reservations: matchedReservations,
    voice_calls: matchedCalls,
  }, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="dsgvo-export-${phone.replace(/\D/g, "")}-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function DELETE(request: Request) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const phone = readPhoneParam(request);
  if (!phone) return NextResponse.json({ error: "Missing ?phone= parameter" }, { status: 400 });

  const { supabase, restaurantId } = ctx;

  // Erstmal IDs finden (mit JS-Match) — direkte SQL-Updates per phone-Wert
  // wuerden Format-Varianten verfehlen.
  const [{ data: reservations }, { data: voiceCalls }] = await Promise.all([
    supabase.from("reservations").select("id, phone")
      .eq("restaurant_id", restaurantId)
      .not("phone", "is", null),
    supabase.from("voice_calls").select("id, phone")
      .eq("restaurant_id", restaurantId)
      .not("phone", "is", null),
  ]);

  const reservationIds = ((reservations ?? []) as { id: string; phone: string | null }[])
    .filter((r) => phonesMatch(r.phone, phone))
    .map((r) => r.id);
  const voiceCallIds = ((voiceCalls ?? []) as { id: string; phone: string | null }[])
    .filter((c) => phonesMatch(c.phone, phone))
    .map((c) => c.id);

  if (reservationIds.length === 0 && voiceCallIds.length === 0) {
    return NextResponse.json({
      ok: true,
      anonymized_reservations: 0,
      anonymized_voice_calls: 0,
      note: "Keine Daten gefunden — nichts zu loeschen.",
    });
  }

  // Anonymisieren statt loeschen — Statistik bleibt intakt
  const errors: string[] = [];
  if (reservationIds.length > 0) {
    const { error } = await supabase.from("reservations").update({
      guest_name: "[geloescht]",
      phone: null,
      email: null,
      note: null,
      approval_reason: null,
    }).in("id", reservationIds);
    if (error) errors.push(`reservations: ${error.message}`);
  }

  if (voiceCallIds.length > 0) {
    const { error } = await supabase.from("voice_calls").update({
      phone: null,
      transcript: [],
      raw_payload: null,
    }).in("id", voiceCallIds);
    if (error) errors.push(`voice_calls: ${error.message}`);
  }

  if (errors.length > 0) {
    return NextResponse.json({
      ok: false,
      errors,
    }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    phone,
    anonymized_reservations: reservationIds.length,
    anonymized_voice_calls: voiceCallIds.length,
    deleted_at: new Date().toISOString(),
  });
}
