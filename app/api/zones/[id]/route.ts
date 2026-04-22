import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";

/**
 * PATCH /api/zones/[id]
 * Body: { name? }
 * DELETE /api/zones/[id]
 * Entfernt den Bereich. Tische in diesem Bereich verlieren ihre
 * zone_id (werden „zonenlos") — DB-Constraint ist `on delete set null`.
 */

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const tenant = await getTenantContext();
  if (!tenant) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await ctx.params;
  const body = await request.json().catch(() => ({}));

  const patch: Record<string, unknown> = {};
  if (typeof body.name === "string") {
    const name = body.name.trim();
    if (!name) return NextResponse.json({ error: "Name darf nicht leer sein." }, { status: 400 });
    if (name.length > 40) return NextResponse.json({ error: "Name zu lang (max. 40 Zeichen)." }, { status: 400 });
    patch.name = name;
  }
  if (Number.isFinite(body.release_minutes) || body.release_minutes === null) {
    patch.release_minutes = body.release_minutes === null ? null : Number(body.release_minutes);
  }
  if (typeof body.color === "string" || body.color === null) {
    patch.color = body.color;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Keine Aenderungen uebergeben." }, { status: 400 });
  }

  const { data, error } = await tenant.supabase
    .from("zones").update(patch)
    .eq("id", id).eq("restaurant_id", tenant.restaurantId)
    .select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const tenant = await getTenantContext();
  if (!tenant) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await ctx.params;

  const { error } = await tenant.supabase
    .from("zones").delete()
    .eq("id", id).eq("restaurant_id", tenant.restaurantId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
