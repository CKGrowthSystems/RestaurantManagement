import { redirect } from "next/navigation";
import { getTenantContext } from "@/lib/tenant";
import { OnboardingWizard } from "./wizard";

export const dynamic = "force-dynamic";

/**
 * Setup-Wizard fuer neue Tenants. Wenn ein Restaurant zum ersten Mal
 * eingeloggt ist (onboarding_completed_at == null), leitet das Dashboard
 * automatisch hierhin um. Hat man schon onboarded, kann man trotzdem die
 * Seite manuell aufrufen — wir laden dann die Felder einfach mit den
 * existierenden Werten und Save aktualisiert sie.
 */
export default async function WelcomePage() {
  const ctx = await getTenantContext();
  if (!ctx) redirect("/login");

  // Existierende Daten laden um Felder vorzubefuellen (z.B. wenn der Tenant
  // sich neu aufmacht oder Wizard neu ausfuellen will).
  const { supabase, restaurantId } = ctx;
  const [{ data: settings }, { data: tables }, { data: zones }] = await Promise.all([
    supabase.from("settings").select("*").eq("restaurant_id", restaurantId).maybeSingle(),
    supabase.from("tables").select("*").eq("restaurant_id", restaurantId),
    supabase.from("zones").select("*").eq("restaurant_id", restaurantId).order("sort_order"),
  ]);

  return (
    <OnboardingWizard
      restaurantName={ctx.restaurant.name}
      brandingInitial={(settings as any)?.branding ?? null}
      hoursInitial={(settings as any)?.opening_hours ?? null}
      zonesCount={(zones ?? []).length}
      tablesCount={(tables ?? []).length}
      alreadyOnboarded={!!ctx.restaurant.onboarding_completed_at}
    />
  );
}
