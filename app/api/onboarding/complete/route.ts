import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";

/**
 * POST /api/onboarding/complete
 *
 * Wird vom Setup-Wizard auf der letzten Step-Page aufgerufen.
 * Setzt restaurants.onboarding_completed_at = now() — ab dann zeigt
 * das Layout das normale Dashboard und nicht mehr den Wizard.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { error } = await ctx.supabase
    .from("restaurants")
    .update({ onboarding_completed_at: new Date().toISOString() })
    .eq("id", ctx.restaurantId);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
