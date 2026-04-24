import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { autoAssign } from "@/lib/assignment";
import type { Reservation, TableRow, Zone } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/walkin
 * Body: { party_size: number, zone?: string, note?: string, table_id?: string, duration_min?: number }
 *
 * Erzeugt eine Walk-In-Gastzuweisung: NICHT eine Reservierung im klassischen
 * Sinn, sondern eine sofortige Platzierung am Tisch. Implementiert ueber
 * reservations mit source="Walk-In", status="Eingetroffen", guest_name="Walk-In",
 * phone=null. starts_at = jetzt. Ohne Name / Telefon.
 *
 * Falls `table_id` mitgegeben wird: Tisch direkt uebernehmen (User hat schon
 * am Plan gewaehlt). Sonst: autoAssign findet freien Tisch.
 */
export async function POST(request: Request) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const party = Number(body.party_size);
  if (!Number.isFinite(party) || party < 1 || party > 40) {
    return NextResponse.json({ error: "Ungültige Personenzahl (1–40)." }, { status: 400 });
  }
  const duration = Number.isFinite(body.duration_min) ? Number(body.duration_min) : 90;
  const now = new Date();

  let tableId: string | null = body.table_id ?? null;
  let approvalReason: string | null = null;

  // Wenn kein expliziter Tisch gewaehlt wurde, autoAssign laufen lassen
  if (!tableId) {
    const [{ data: tables }, { data: zones }, { data: existing }] = await Promise.all([
      ctx.supabase.from("tables").select("*").eq("restaurant_id", ctx.restaurantId),
      ctx.supabase.from("zones").select("*").eq("restaurant_id", ctx.restaurantId),
      ctx.supabase.from("reservations").select("*").eq("restaurant_id", ctx.restaurantId)
        .gte("starts_at", new Date(now.getTime() - 2 * 3600_000).toISOString())
        .lte("starts_at", new Date(now.getTime() + 4 * 3600_000).toISOString()),
    ]);

    if ((tables ?? []).length === 0) {
      return NextResponse.json({ error: "Keine Tische konfiguriert." }, { status: 400 });
    }

    const decision = autoAssign({
      tables: (tables ?? []) as TableRow[],
      zones: (zones ?? []) as Zone[],
      existing: (existing ?? []) as Reservation[],
      partySize: party,
      startsAt: now,
      durationMin: duration,
      preferredZoneName: body.zone ?? null,
      requireAccessible: false,
    });

    if (!decision.tableId) {
      return NextResponse.json({ error: "Kein freier Tisch für diese Personenzahl." }, { status: 409 });
    }
    tableId = decision.tableId;
    approvalReason = decision.approvalReason;
  }

  const { data, error } = await ctx.supabase
    .from("reservations")
    .insert({
      restaurant_id: ctx.restaurantId,
      table_id: tableId,
      guest_name: "Walk-In",
      phone: null,
      email: null,
      party_size: party,
      starts_at: now.toISOString(),
      duration_min: duration,
      source: "Walk-In",
      status: "Eingetroffen",
      note: body.note ?? null,
      auto_assigned: !body.table_id,
      approval_reason: approvalReason,
    })
    .select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data, { status: 201 });
}
