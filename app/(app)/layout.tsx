import { redirect } from "next/navigation";
import { getTenantContext } from "@/lib/tenant";
import { Sidebar } from "@/components/shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getTenantContext();
  if (!ctx) redirect("/login");

  const { supabase, restaurantId } = ctx;

  const [{ count: openCount }, { count: voiceCount }] = await Promise.all([
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
  ]);

  // Apply tenant theme via data-theme on <html>.
  const theme = ctx.restaurant?.theme ?? "default";

  return (
    <div
      style={{ display: "flex", minHeight: "100vh", background: "var(--hi-bg)" }}
      data-restaurant-theme={theme}
    >
      <Sidebar
        displayName={ctx.displayName}
        role={ctx.role}
        restaurantName={ctx.restaurant?.name ?? "Rhodos"}
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
