import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";

export async function PATCH(request: Request) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const body = await request.json();

  const patch: Record<string, unknown> = { restaurant_id: ctx.restaurantId };
  for (const key of ["release_mode", "release_minutes", "voice_prompt", "opening_hours", "branding", "notify"] as const) {
    if (key in body) patch[key] = body[key];
  }
  const { data, error } = await ctx.supabase
    .from("settings").upsert(patch).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
