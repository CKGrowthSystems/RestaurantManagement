import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";

export async function POST(request: Request) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const body = await request.json();
  if (!body.name) return NextResponse.json({ error: "name required" }, { status: 400 });

  const { data: existing } = await ctx.supabase
    .from("floors").select("sort_order")
    .eq("restaurant_id", ctx.restaurantId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sort_order = ((existing as any)?.sort_order ?? -1) + 1;

  const { data, error } = await ctx.supabase
    .from("floors")
    .insert({
      restaurant_id: ctx.restaurantId,
      name: body.name,
      sort_order,
      room_width: body.room_width ?? 940,
      room_height: body.room_height ?? 480,
      entrance_x: body.entrance_x ?? 600,
      entrance_y: body.entrance_y ?? 440,
      entrance_w: body.entrance_w ?? 60,
      entrance_h: body.entrance_h ?? 20,
    })
    .select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data, { status: 201 });
}
