"use client";
import Link from "next/link";
import { HiBtn } from "@/components/primitives";
import { Topbar } from "@/components/shell";
import { useRealtimeCount } from "@/lib/supabase/realtime";

/**
 * Dashboard-Topbar mit live-aktualisiertem Reservierungs-Count.
 * Wird aufgerufen mit den initialen Server-Counts + restaurantId;
 * der Count-Wert tickt dann ueber Supabase-Realtime-Subscription mit.
 */
export function DashboardTopbarLive({
  greet, displayName, weekday, dateLabel, initialReservations, restaurantId, dayStartISO, dayEndISO,
}: {
  greet: string;
  displayName: string;
  weekday: string;
  dateLabel: string;
  initialReservations: number;
  restaurantId: string;
  dayStartISO: string;
  dayEndISO: string;
}) {
  const resCount = useRealtimeCount("reservations", restaurantId, initialReservations, {
    filter: (q) => q.gte("starts_at", dayStartISO).lt("starts_at", dayEndISO),
    additionalFilterString: `day-${dayStartISO}`,
  });
  const firstName = displayName.split(" ")[0];
  return (
    <Topbar
      title={`${greet}, ${firstName}`}
      subtitle={`${weekday}, ${dateLabel} · ${resCount} Reservierung${resCount === 1 ? "" : "en"} heute`}
      right={
        <Link href="/reservations/new">
          <HiBtn kind="primary" size="md" icon="plus">Neue Reservierung</HiBtn>
        </Link>
      }
    />
  );
}
