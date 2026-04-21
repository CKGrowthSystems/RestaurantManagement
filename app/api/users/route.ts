import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { isDemoMode } from "@/lib/env";
import type { AppUser } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/users
 *
 * Returns the list of users who have a membership in the current restaurant.
 * In demo mode, returns a fake list. Otherwise joins memberships with
 * auth.users via the admin client (service role needed because client-side
 * has no direct access to auth.users).
 */
export async function GET() {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  if (isDemoMode()) {
    const users: AppUser[] = [
      { id: "demo-owner",   email: "giorgos@rhodos.local", display_name: "Giorgos A.",   role: "owner",   created_at: new Date().toISOString(), last_sign_in_at: new Date().toISOString() },
      { id: "demo-manager", email: "sofia@rhodos.local",   display_name: "Sofia T.",     role: "manager", created_at: new Date().toISOString(), last_sign_in_at: null },
      { id: "demo-staff",   email: "nikos@rhodos.local",   display_name: "Nikos P.",     role: "staff",   created_at: new Date().toISOString(), last_sign_in_at: new Date(Date.now() - 3600_000).toISOString() },
    ];
    return NextResponse.json({ users });
  }

  // Real mode: query memberships, then enrich with auth data via admin client.
  const { data: members, error } = await ctx.supabase
    .from("memberships")
    .select("user_id, role, display_name, created_at")
    .eq("restaurant_id", ctx.restaurantId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Fetch emails + last_sign_in via admin client if service role is available.
  let enriched: AppUser[] = (members ?? []).map((m: any) => ({
    id: m.user_id,
    email: "",
    display_name: m.display_name || "Team-Mitglied",
    role: m.role,
    created_at: m.created_at,
    last_sign_in_at: null,
  }));

  try {
    // Lazy import to avoid forcing service-role env in builds that don't use it.
    const { createAdminClient } = await import("@/lib/supabase/server");
    const admin = createAdminClient();
    const results = await Promise.all(
      enriched.map(async (u) => {
        const { data } = await admin.auth.admin.getUserById(u.id);
        if (data?.user) {
          u.email = data.user.email ?? u.email;
          u.last_sign_in_at = data.user.last_sign_in_at ?? null;
        }
        return u;
      })
    );
    enriched = results;
  } catch {
    // service-role unavailable — return without email enrichment
  }

  return NextResponse.json({ users: enriched });
}
