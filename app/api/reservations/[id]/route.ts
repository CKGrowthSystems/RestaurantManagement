import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const tenant = await getTenantContext();
  if (!tenant) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await ctx.params;
  const body = await request.json();

  const patch: Record<string, unknown> = {};
  for (const key of ["table_id", "guest_name", "phone", "email", "party_size", "starts_at", "duration_min", "status", "note", "auto_assigned", "approval_reason"] as const) {
    if (key in body) patch[key] = body[key];
  }
  // When the owner confirms, clear the approval flag and reason.
  if (body.status === "Bestätigt" && !("auto_assigned" in body)) {
    patch.auto_assigned = false;
    patch.approval_reason = null;
  }
  const { data, error } = await tenant.supabase
    .from("reservations").update(patch)
    .eq("id", id).eq("restaurant_id", tenant.restaurantId)
    .select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

export async function DELETE(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const tenant = await getTenantContext();
  if (!tenant) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await ctx.params;
  const { error } = await tenant.supabase
    .from("reservations").delete()
    .eq("id", id).eq("restaurant_id", tenant.restaurantId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
