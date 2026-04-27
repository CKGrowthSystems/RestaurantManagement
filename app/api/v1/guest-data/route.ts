import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { phonesMatch } from "@/lib/phone";

/**
 * DSGVO-Endpoints fuer Gastdaten
 * ===============================
 *
 * GET    /api/v1/guest-data?phone=<n>            → Auskunftsrecht Art. 15 (Download)
 * GET    /api/v1/guest-data?phone=<n>&preview=1  → Preview ohne Download-Header
 * GET    /api/v1/guest-data?email=<a>            → Suche per Email
 * GET    /api/v1/guest-data?phone=<n>&email=<a>  → OR-Match (beide reichen)
 * DELETE /api/v1/guest-data?phone=<n>            → Recht auf Loeschung Art. 17
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
 * Match: phonesMatch() (Format-tolerant, last-9-digits) fuer Phone,
 *        case-insensitive exact-match fuer Email.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SearchTerms = {
  phone: string | null;
  email: string | null;
  preview: boolean;
};

function readSearchTerms(request: Request): SearchTerms {
  const url = new URL(request.url);
  const phone = url.searchParams.get("phone")?.trim() || null;
  const email = url.searchParams.get("email")?.trim().toLowerCase() || null;
  const preview = url.searchParams.get("preview") === "1";
  return { phone, email, preview };
}

function emailsMatch(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export async function GET(request: Request) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { phone, email, preview } = readSearchTerms(request);
  if (!phone && !email) {
    return NextResponse.json({ error: "Missing ?phone= or ?email= parameter" }, { status: 400 });
  }

  const { supabase, restaurantId } = ctx;

  // Wir holen alle Reservierungen + Voice-Calls fuer diesen Tenant mit
  // Phone ODER Email gesetzt, dann filtern wir client-seitig: phonesMatch()
  // fuer Format-Toleranz, exact-lowercase fuer Email.
  const [{ data: reservations }, { data: voiceCalls }] = await Promise.all([
    supabase.from("reservations").select("*")
      .eq("restaurant_id", restaurantId)
      .or("phone.not.is.null,email.not.is.null")
      .order("starts_at", { ascending: false }),
    supabase.from("voice_calls").select("*")
      .eq("restaurant_id", restaurantId)
      .not("phone", "is", null)
      .order("started_at", { ascending: false }),
  ]);

  const matchedReservations = ((reservations ?? []) as { phone: string | null; email: string | null }[])
    .filter((r) => (phone && phonesMatch(r.phone, phone)) || (email && emailsMatch(r.email, email)));
  const matchedCalls = ((voiceCalls ?? []) as { phone: string | null }[])
    .filter((c) => phone && phonesMatch(c.phone, phone));

  const body = {
    phone,
    email,
    restaurant_id: restaurantId,
    exported_at: new Date().toISOString(),
    reservations_count: matchedReservations.length,
    voice_calls_count: matchedCalls.length,
    reservations: preview ? matchedReservations.slice(0, 5) : matchedReservations,
    voice_calls: preview ? matchedCalls.slice(0, 5) : matchedCalls,
    preview,
  };

  // Preview: kein Download-Header, das UI zeigt nur Counts + Sample
  if (preview) {
    return NextResponse.json(body, {
      headers: { "Cache-Control": "no-store" },
    });
  }

  // Vollexport: als Download-File
  const slug = (phone ?? email ?? "guest").replace(/[^a-z0-9]/gi, "");
  return NextResponse.json(body, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="dsgvo-export-${slug}-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function DELETE(request: Request) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { phone, email } = readSearchTerms(request);
  if (!phone && !email) {
    return NextResponse.json({ error: "Missing ?phone= or ?email= parameter" }, { status: 400 });
  }

  const { supabase, restaurantId } = ctx;

  // IDs finden — alle Reservierungen mit phone ODER email die matchen.
  const [{ data: reservations }, { data: voiceCalls }] = await Promise.all([
    supabase.from("reservations").select("id, phone, email")
      .eq("restaurant_id", restaurantId)
      .or("phone.not.is.null,email.not.is.null"),
    supabase.from("voice_calls").select("id, phone")
      .eq("restaurant_id", restaurantId)
      .not("phone", "is", null),
  ]);

  const reservationIds = ((reservations ?? []) as { id: string; phone: string | null; email: string | null }[])
    .filter((r) => (phone && phonesMatch(r.phone, phone)) || (email && emailsMatch(r.email, email)))
    .map((r) => r.id);
  const voiceCallIds = ((voiceCalls ?? []) as { id: string; phone: string | null }[])
    .filter((c) => phone && phonesMatch(c.phone, phone))
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
    email,
    anonymized_reservations: reservationIds.length,
    anonymized_voice_calls: voiceCallIds.length,
    deleted_at: new Date().toISOString(),
  });
}
