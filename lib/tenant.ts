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

  // BEWUSST OHNE onboarding_completed_at — falls Migration 0017 noch nicht
  // eingespielt ist, wuerde das die ganze Query zum Absturz bringen und der
  // User landet in einem Redirect-Loop. Wir holen die Spalte unten separat
  // mit try/catch und behandeln Fehlen als „bereits onboarded".
  const { data: membership } = await supabase
    .from("memberships")
    .select("restaurant_id, role, display_name, restaurants(name, theme, logo_url)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!membership) return null;

  const restaurantBase = (membership.restaurants ?? {}) as {
    name: string; theme: string; logo_url: string | null;
  };

  // Onboarding-Flag defensiv: Migration evtl. nicht eingespielt → als done
  // behandeln. Spalte da + null → Wizard zeigen. Spalte da + Timestamp → done.
  let onboardingCompletedAt: string | null = new Date().toISOString();
  try {
    const { data: rest, error } = await supabase
      .from("restaurants")
      .select("onboarding_completed_at")
      .eq("id", membership.restaurant_id)
      .maybeSingle();
    if (!error && rest) {
      onboardingCompletedAt = (rest as any).onboarding_completed_at ?? null;
    }
    // Bei error: Spalte existiert nicht → onboardingCompletedAt bleibt
    // bei „now()" → Dashboard zeigt sich normal (keine Wizard-Umleitung).
  } catch {
    // Network/Lib-Error → genauso behandeln (kein Loop riskieren).
  }

  const restaurant = {
    ...restaurantBase,
    onboarding_completed_at: onboardingCompletedAt,
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
