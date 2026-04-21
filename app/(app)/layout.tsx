import { redirect } from "next/navigation";
import { getTenantContext } from "@/lib/tenant";
import { Sidebar } from "@/components/shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getTenantContext();
  if (!ctx) redirect("/login");

  const { supabase, restaurantId } = ctx;

  const [{ count: openCount }, { count: voiceCount }, settingsRes] = await Promise.all([
    supabase
      .from("reservations")
      .select("*", { count: "exact", head: true })
      .eq("restaurant_id", restaurantId)
      .eq("status", "Offen"),
    supabase
      .from("voice_calls")
      .select("*", { count: "exact", head: true })
      .eq("restaurant_id", restaurantId)
      .gte("started_at", new Date(Date.now() - 24 * 3600_000).toISOString()),
    supabase
      .from("settings")
      .select("branding")
      .eq("restaurant_id", restaurantId)
      .maybeSingle(),
  ]);

  // Apply tenant theme via data-theme on <html>.
  const theme = ctx.restaurant?.theme ?? "default";

  const brandingName = (settingsRes?.data as any)?.branding?.public_name as string | undefined;
  const fallbackName = ctx.restaurant?.name ?? "Rhodos";
  const effectiveName = (brandingName && brandingName.trim()) || fallbackName;

  return (
    <div
      style={{ display: "flex", minHeight: "100vh", background: "var(--hi-bg)" }}
      data-restaurant-theme={theme}
    >
      <Sidebar
        displayName={ctx.displayName}
        role={ctx.role}
        restaurantName={effectiveName}
        badges={{
          reservations: { n: openCount ?? 0 },
          voice: { n: voiceCount ?? 0, tone: "accent" },
        }}
      />
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        {children}
      </div>
    </div>
  );
}
