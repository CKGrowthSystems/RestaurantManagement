import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { autoAssign } from "@/lib/assignment";
import type { Reservation, TableRow, Zone } from "@/lib/types";

export async function POST(request: Request) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const body = await request.json();

  for (const k of ["guest_name", "party_size", "starts_at"]) {
    if (!(k in body) || body[k] == null) {
      return NextResponse.json({ error: `${k} required` }, { status: 400 });
    }
  }
  const party = Number(body.party_size);
  const durationMin = Number(body.duration_min ?? 90);
  const startsAt = new Date(body.starts_at);

  // Auto-assign unless caller explicitly passed a table_id.
  let tableId: string | null = body.table_id ?? null;
  let status: "Bestätigt" | "Offen" = body.status ?? "Bestätigt";
  let autoAssigned = false;
  let approvalReason: string | null = null;

  if (!tableId) {
    const [{ data: tables }, { data: zones }, { data: existing }] = await Promise.all([
      ctx.supabase.from("tables").select("*").eq("restaurant_id", ctx.restaurantId),
      ctx.supabase.from("zones").select("*").eq("restaurant_id", ctx.restaurantId),
      ctx.supabase.from("reservations").select("*").eq("restaurant_id", ctx.restaurantId)
        .gte("starts_at", new Date(startsAt.getTime() - 4 * 3600_000).toISOString())
        .lte("starts_at", new Date(startsAt.getTime() + 4 * 3600_000).toISOString()),
    ]);
    const decision = autoAssign({
      tables: (tables ?? []) as TableRow[],
      zones: (zones ?? []) as Zone[],
      existing: (existing ?? []) as Reservation[],
      partySize: party, startsAt, durationMin,
      preferredZoneName: body.zone ?? null,
      requireAccessible: !!body.accessible,
    });
    tableId = decision.tableId;
    status = decision.status;
    autoAssigned = decision.autoAssigned;
    approvalReason = decision.approvalReason;
  }

  const { data, error } = await ctx.supabase
    .from("reservations")
    .insert({
      restaurant_id: ctx.restaurantId,
      table_id: tableId,
      guest_name: body.guest_name,
      phone: body.phone ?? null,
      email: body.email ?? null,
      party_size: party,
      starts_at: startsAt.toISOString(),
      duration_min: durationMin,
      source: body.source ?? "Web",
      status,
      note: body.note ?? null,
      auto_assigned: autoAssigned,
      approval_reason: approvalReason,
    })
    .select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data, { status: 201 });
}
