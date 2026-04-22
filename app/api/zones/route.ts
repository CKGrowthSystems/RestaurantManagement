import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";

/**
 * POST /api/zones
 * Body: { name, floor_id, bbox_x?, bbox_y?, bbox_w?, bbox_h?, color?, release_minutes? }
 * Erstellt einen neuen Bereich im aktuellen Restaurant + Raum.
 */
export async function POST(request: Request) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const body = await request.json().catch(() => ({}));

  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "Name fehlt." }, { status: 400 });
  if (name.length > 40) return NextResponse.json({ error: "Name zu lang (max. 40 Zeichen)." }, { status: 400 });
  if (!body.floor_id) return NextResponse.json({ error: "floor_id fehlt." }, { status: 400 });

  // sort_order = naechster freier Wert
  const { data: existing } = await ctx.supabase
    .from("zones").select("sort_order")
    .eq("restaurant_id", ctx.restaurantId)
    .eq("floor_id", body.floor_id)
    .order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const sort_order = ((existing?.sort_order ?? -1) as number) + 1;

  const { data, error } = await ctx.supabase.from("zones").insert({
    restaurant_id: ctx.restaurantId,
    floor_id: body.floor_id,
    name,
    sort_order,
    bbox_x: clamp(body.bbox_x, 0, 4000, 40),
    bbox_y: clamp(body.bbox_y, 0, 4000, 80),
    bbox_w: clamp(body.bbox_w, 60, 4000, 240),
    bbox_h: clamp(body.bbox_h, 60, 4000, 200),
    color: body.color ?? null,
    release_minutes: Number.isFinite(body.release_minutes) ? Number(body.release_minutes) : null,
  }).select().single();

  if (error) {
    // Unique constraint on (restaurant_id, name): netter Fehler
    if (String(error.message).toLowerCase().includes("duplicate") || String(error.message).includes("unique")) {
      return NextResponse.json({ error: `Ein Bereich mit dem Namen „${name}" existiert bereits.` }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json(data, { status: 201 });
}

function clamp(v: unknown, min: number, max: number, fallback: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}
