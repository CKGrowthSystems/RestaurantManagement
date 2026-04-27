import { cache } from "react";
import { createClient } from "./supabase/server";
import { createDemoClient } from "./supabase/demo";
import { isDemoMode } from "./env";
import { DEMO_RESTAURANT_ID } from "./demo-store";

export interface TenantContext {
  supabase: any;
  user: { id: string; email?: string | null };
  restaurantId: string;
  role: "owner" | "manager" | "staff";
  displayName: string;
  restaurant: {
    name: string;
    theme: string;
    logo_url: string | null;
    onboarding_completed_at: string | null;
  };
}

/**
 * Per-Request Cache via React `cache()`:
 * Innerhalb EINER Server-Render-Pass (Middleware -> Layout -> Page) wird
 * diese Funktion nur 1x ausgefuehrt. Damit fallen redundante Supabase
 * Auth-Checks + Membership-Queries weg und die Navigation wird deutlich
 * schneller. Beim naechsten Request (z. B. nach Klick auf einen NavLink)
 * ist der Cache frisch.
 */
export const getTenantContext = cache(async (): Promise<TenantContext | null> => {
  if (isDemoMode()) {
    const supabase = createDemoClient();
    return {
      supabase,
      user: { id: "demo-user", email: "demo@rhodos.local" },
      restaurantId: DEMO_RESTAURANT_ID,
      role: "owner",
      displayName: "Giorgos A.",
      restaurant: {
        name: "Rhodos Ohlsbach", theme: "default", logo_url: null,
        onboarding_completed_at: new Date().toISOString(),
      },
    };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: membership } = await supabase
    .from("memberships")
    .select("restaurant_id, role, display_name, restaurants(name, theme, logo_url, onboarding_completed_at)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!membership) return null;

  const restaurant = (membership.restaurants ?? {}) as {
    name: string; theme: string; logo_url: string | null;
    onboarding_completed_at: string | null;
  };

  return {
    supabase,
    user: { id: user.id, email: user.email },
    restaurantId: membership.restaurant_id as string,
    role: membership.role as "owner" | "manager" | "staff",
    displayName: (membership.display_name as string) || user.email?.split("@")[0] || "Team",
    restaurant,
  };
});
