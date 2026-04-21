import Link from "next/link";
import { redirect } from "next/navigation";
import { getTenantContext } from "@/lib/tenant";
import { Topbar } from "@/components/shell";
import { HiBtn } from "@/components/primitives";
import { ReservationsKanban } from "./kanban";
import type { Reservation, TableRow } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ReservationsPage() {
  const ctx = await getTenantContext();
  if (!ctx) redirect("/login");
  const { supabase, restaurantId } = ctx;

  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);

  const [{ data: reservations }, { data: tables }] = await Promise.all([
    supabase.from("reservations").select("*")
      .eq("restaurant_id", restaurantId)
      .gte("starts_at", dayStart.toISOString())
      .lt("starts_at", dayEnd.toISOString())
      .order("starts_at"),
    supabase.from("tables").select("id, label").eq("restaurant_id", restaurantId),
  ]);

  const open = (reservations ?? []).filter((r: Reservation) => r.status === "Offen").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>
      <Topbar
        title="Reservierungen"
        subtitle={`Heute · ${(reservations ?? []).length} Reservierungen${open ? ` · ${open} warten auf Bestätigung` : ""}`}
        right={
          <Link href="/reservations/new">
            <HiBtn kind="primary" size="md" icon="plus">Neue Reservierung</HiBtn>
          </Link>
        }
      />
      <ReservationsKanban
        initial={(reservations ?? []) as Reservation[]}
        tables={(tables ?? []) as Pick<TableRow, "id" | "label">[]}
      />
    </div>
  );
}
