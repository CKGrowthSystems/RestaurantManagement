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
  restaurant: { name: string; theme: string; logo_url: string | null };
}

export async function getTenantContext(): Promise<TenantContext | null> {
  if (isDemoMode()) {
    const supabase = createDemoClient();
    return {
      supabase,
      user: { id: "demo-user", email: "demo@rhodos.local" },
      restaurantId: DEMO_RESTAURANT_ID,
      role: "owner",
      displayName: "Giorgos A.",
      restaurant: { name: "Rhodos Ohlsbach", theme: "default", logo_url: null },
    };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: membership } = await supabase
    .from("memberships")
    .select("restaurant_id, role, display_name, restaurants(name, theme, logo_url)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!membership) return null;

  const restaurant = (membership.restaurants ?? {}) as { name: string; theme: string; logo_url: string | null };

  return {
    supabase,
    user: { id: user.id, email: user.email },
    restaurantId: membership.restaurant_id as string,
    role: membership.role as "owner" | "manager" | "staff",
    displayName: (membership.display_name as string) || user.email?.split("@")[0] || "Team",
    restaurant,
  };
}
