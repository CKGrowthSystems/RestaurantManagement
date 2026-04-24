import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";

export async function POST(request: Request) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await request.json();
  const { label, seats, shape, zone_id, accessible, notes, pos_x, pos_y, requires_approval, approval_note } = body ?? {};
  if (!label || !Number.isFinite(seats)) {
    return NextResponse.json({ error: "label and seats required" }, { status: 400 });
  }

  const { data, error } = await ctx.supabase
    .from("tables")
    .insert({
      restaurant_id: ctx.restaurantId,
      label, seats: Number(seats),
      shape: shape === "square" ? "square" : "round",
      zone_id: zone_id || null,
      accessible: !!accessible,
      notes: notes ?? null,
      pos_x: Number.isFinite(pos_x) ? pos_x : 100,
      pos_y: Number.isFinite(pos_y) ? pos_y : 100,
      requires_approval: !!requires_approval,
      approval_note: requires_approval && typeof approval_note === "string" ? (approval_note.trim() || null) : null,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data, { status: 201 });
}
