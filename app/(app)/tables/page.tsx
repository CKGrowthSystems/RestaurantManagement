import { redirect } from "next/navigation";
import { getTenantContext } from "@/lib/tenant";
import { Topbar } from "@/components/shell";
import { TablesClient } from "./tables-client";
import type { TableRow, Zone } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function TablesPage() {
  const ctx = await getTenantContext();
  if (!ctx) redirect("/login");
  const { supabase, restaurantId } = ctx;

  const [{ data: tables }, { data: zones }, { data: reservations }] = await Promise.all([
    supabase.from("tables").select("*").eq("restaurant_id", restaurantId).order("label"),
    supabase.from("zones").select("*").eq("restaurant_id", restaurantId).order("sort_order"),
    supabase
      .from("reservations")
      .select("table_id, status, starts_at, duration_min")
      .eq("restaurant_id", restaurantId)
      .gte("starts_at", new Date(new Date().setHours(0, 0, 0, 0)).toISOString()),
  ]);

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>
      <Topbar
        title="Tische"
        subtitle={`${(tables ?? []).length} Tische · ${(zones ?? []).length} Bereiche · Kapazität ${(tables ?? []).reduce((s, t) => s + t.seats, 0)} Plätze`}
      />
      <TablesClient
        initialTables={(tables ?? []) as TableRow[]}
        zones={(zones ?? []) as Zone[]}
        todayReservations={(reservations ?? []) as any[]}
      />
    </div>
  );
}
