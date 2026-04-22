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

  const branding = (settingsRes?.data as any)?.branding as { public_name?: string; primary_color?: string; accent_color?: string } | null;
  const brandingName = branding?.public_name;
  const fallbackName = ctx.restaurant?.name ?? "Rhodos";
  const effectiveName = (brandingName && brandingName.trim()) || fallbackName;

  // Branding-Farben als CSS-Variablen-Override (wirkt global, weil
  // var(--hi-accent) an vielen Stellen genutzt wird).
  const brandingStyle: React.CSSProperties = {
    display: "flex", minHeight: "100vh", background: "var(--hi-bg)",
    ...(branding?.primary_color ? { ["--hi-accent" as any]: branding.primary_color } : {}),
    ...(branding?.accent_color  ? { ["--hi-on-accent" as any]: "#ffffff" } : {}),
  };

  return (
    <div
      style={brandingStyle}
      data-restaurant-theme={theme}
    >
      <Sidebar
        displayName={ctx.displayName}
        role={ctx.role}
        restaurantName={effectiveName}
        restaurantId={restaurantId}
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
