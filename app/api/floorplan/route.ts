import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";

/**
 * PATCH /api/floorplan
 *
 * Speichert das Layout *eines* Floors (Raum + Zonen + Tische).
 *
 * Body:
 *   {
 *     "floor_id": "…",
 *     "room":   { "width": 940, "height": 480, "entrance_x": 600, "entrance_y": 440, "entrance_w": 60, "entrance_h": 20 },
 *     "zones":  [{ "id": "…", "bbox_x": 20, "bbox_y": 60, "bbox_w": 360, "bbox_h": 360 }, …],
 *     "tables": [{ "id": "…", "pos_x": 100, "pos_y": 200, "zone_id": "…" }, …]
 *   }
 */
export async function PATCH(request: Request) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const body = await request.json();

  if (body.floor_id && body.room) {
    const r = body.room;
    await ctx.supabase.from("floors").update({
      room_width: clamp(r.width, 400, 4000),
      room_height: clamp(r.height, 300, 3000),
      entrance_x: clamp(r.entrance_x, 0, 4000),
      entrance_y: clamp(r.entrance_y, 0, 3000),
      entrance_w: clamp(r.entrance_w, 10, 400),
      entrance_h: clamp(r.entrance_h, 10, 400),
    }).eq("id", body.floor_id).eq("restaurant_id", ctx.restaurantId);
  }

  if (Array.isArray(body.zones)) {
    for (const z of body.zones) {
      if (!z.id) continue;
      await ctx.supabase.from("zones").update({
        bbox_x: clamp(z.bbox_x, 0, 4000),
        bbox_y: clamp(z.bbox_y, 0, 4000),
        bbox_w: clamp(z.bbox_w, 40, 4000),
        bbox_h: clamp(z.bbox_h, 40, 4000),
      }).eq("id", z.id).eq("restaurant_id", ctx.restaurantId);
    }
  }

  if (Array.isArray(body.tables)) {
    for (const t of body.tables) {
      if (!t.id) continue;
      const patch: Record<string, unknown> = {
        pos_x: clamp(t.pos_x, 0, 4000),
        pos_y: clamp(t.pos_y, 0, 4000),
      };
      if ("zone_id" in t) patch.zone_id = t.zone_id;
      await ctx.supabase.from("tables").update(patch)
        .eq("id", t.id).eq("restaurant_id", ctx.restaurantId);
    }
  }

  return NextResponse.json({ ok: true });
}

function clamp(n: unknown, min: number, max: number): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, Math.round(v)));
}
