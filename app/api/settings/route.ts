import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";

export async function PATCH(request: Request) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const body = await request.json();

  // For jsonb columns (branding, notify) we merge with existing values so that
  // partial updates — e.g. "set only branding.public_name" — don't clobber
  // other keys. If the caller sends `{ branding: null }` we reset the column.
  let existing: any = null;
  if (body.branding !== undefined || body.notify !== undefined) {
    const { data } = await ctx.supabase
      .from("settings")
      .select("branding, notify")
      .eq("restaurant_id", ctx.restaurantId)
      .maybeSingle();
    existing = data ?? null;
  }

  const patch: Record<string, unknown> = { restaurant_id: ctx.restaurantId };
  for (const key of ["release_mode", "release_minutes", "voice_prompt", "opening_hours"] as const) {
    if (key in body) patch[key] = body[key];
  }
  if ("branding" in body) {
    patch.branding = body.branding === null ? null : { ...(existing?.branding ?? {}), ...body.branding };
  }
  if ("notify" in body) {
    patch.notify = body.notify === null ? null : { ...(existing?.notify ?? {}), ...body.notify };
  }

  const { data, error } = await ctx.supabase
    .from("settings").upsert(patch).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
