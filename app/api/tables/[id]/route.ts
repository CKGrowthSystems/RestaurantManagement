import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const tenant = await getTenantContext();
  if (!tenant) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await ctx.params;

  const body = await request.json();
  const patch: Record<string, unknown> = {};
  for (const key of ["label", "seats", "shape", "zone_id", "accessible", "notes", "pos_x", "pos_y"] as const) {
    if (key in body) patch[key] = body[key];
  }
  const { data, error } = await tenant.supabase
    .from("tables").update(patch)
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
    .from("tables").delete()
    .eq("id", id).eq("restaurant_id", tenant.restaurantId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
