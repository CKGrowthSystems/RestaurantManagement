import { redirect } from "next/navigation";
import { getTenantContext } from "@/lib/tenant";
import { Topbar } from "@/components/shell";
import { NewReservationWizard } from "./wizard";
import type { Reservation, TableRow, Zone } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function NewReservationPage() {
  const ctx = await getTenantContext();
  if (!ctx) redirect("/login");
  const { supabase, restaurantId } = ctx;

  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 2);

  const [{ data: tables }, { data: zones }, { data: reservations }] = await Promise.all([
    supabase.from("tables").select("*").eq("restaurant_id", restaurantId).order("label"),
    supabase.from("zones").select("*").eq("restaurant_id", restaurantId).order("sort_order"),
    supabase.from("reservations").select("*")
      .eq("restaurant_id", restaurantId)
      .gte("starts_at", dayStart.toISOString())
      .lt("starts_at", dayEnd.toISOString()),
  ]);

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>
      <Topbar title="Neue Reservierung" subtitle="Geführter Wizard · 4 Schritte" />
      <NewReservationWizard
        tables={(tables ?? []) as TableRow[]}
        zones={(zones ?? []) as Zone[]}
        existing={(reservations ?? []) as Reservation[]}
      />
    </div>
  );
}
