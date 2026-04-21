import { redirect } from "next/navigation";
import { getTenantContext } from "@/lib/tenant";
import { Topbar } from "@/components/shell";
import { FloorplanClient } from "./floorplan-client";
import type { Floor, Reservation, TableRow, Zone } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function FloorplanPage() {
  const ctx = await getTenantContext();
  if (!ctx) redirect("/login");
  const { supabase, restaurantId } = ctx;

  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);

  const [{ data: floors }, { data: tables }, { data: zones }, { data: reservations }] = await Promise.all([
    supabase.from("floors").select("*").eq("restaurant_id", restaurantId).order("sort_order"),
    supabase.from("tables").select("*").eq("restaurant_id", restaurantId),
    supabase.from("zones").select("*").eq("restaurant_id", restaurantId).order("sort_order"),
    supabase.from("reservations").select("*")
      .eq("restaurant_id", restaurantId)
      .gte("starts_at", dayStart.toISOString())
      .lt("starts_at", dayEnd.toISOString())
      .order("starts_at"),
  ]);

  const now = new Date();
  const subtitle = `${now.toLocaleDateString("de-DE", { weekday: "long" })} ${now.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} · ${(tables ?? []).length} Tische · ${(floors ?? []).length} Räume`;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>
      <Topbar title="Tischplan" subtitle={subtitle} />
      <FloorplanClient
        floors={(floors ?? []) as Floor[]}
        tables={(tables ?? []) as TableRow[]}
        zones={(zones ?? []) as Zone[]}
        reservations={(reservations ?? []) as Reservation[]}
      />
    </div>
  );
}
