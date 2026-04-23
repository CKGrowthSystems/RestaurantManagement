import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";

export const dynamic = "force-dynamic";

/**
 * GET /api/users/me
 * Returns { id, email, display_name, role } fuer den aktuell eingeloggten User.
 */
export async function GET() {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  return NextResponse.json({
    id: ctx.user.id,
    email: ctx.user.email ?? null,
    display_name: ctx.displayName,
    role: ctx.role,
  });
}

/**
 * PATCH /api/users/me
 * Body: { display_name: string }
 * Aktualisiert den Anzeigenamen des aktuellen Users in seiner Mitgliedschaft
 * im aktuellen Restaurant.
 */
export async function PATCH(request: Request) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const displayName = typeof body.display_name === "string" ? body.display_name.trim() : "";
  if (!displayName) return NextResponse.json({ error: "Name darf nicht leer sein." }, { status: 400 });
  if (displayName.length > 60) return NextResponse.json({ error: "Name zu lang (max. 60 Zeichen)." }, { status: 400 });

  const { data, error } = await ctx.supabase
    .from("memberships")
    .update({ display_name: displayName })
    .eq("user_id", ctx.user.id)
    .eq("restaurant_id", ctx.restaurantId)
    .select("user_id, display_name, role")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({
    id: ctx.user.id,
    email: ctx.user.email ?? null,
    display_name: data.display_name,
    role: data.role,
  });
}
