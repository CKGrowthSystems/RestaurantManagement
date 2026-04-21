import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const tenant = await getTenantContext();
  if (!tenant) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await ctx.params;
  const body = await request.json();
  const patch: Record<string, unknown> = {};
  for (const k of ["name", "sort_order", "room_width", "room_height", "entrance_x", "entrance_y", "entrance_w", "entrance_h"] as const) {
    if (k in body) patch[k] = body[k];
  }
  const { data, error } = await tenant.supabase
    .from("floors").update(patch)
    .eq("id", id).eq("restaurant_id", tenant.restaurantId)
    .select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

export async function DELETE(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const tenant = await getTenantContext();
  if (!tenant) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await ctx.params;

  const { count } = await tenant.supabase.from("floors").select("*", { count: "exact", head: true })
    .eq("restaurant_id", tenant.restaurantId);
  if ((count ?? 0) <= 1) {
    return NextResponse.json({ error: "Mindestens ein Raum muss bestehen bleiben." }, { status: 400 });
  }

  const { error } = await tenant.supabase.from("floors").delete()
    .eq("id", id).eq("restaurant_id", tenant.restaurantId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
