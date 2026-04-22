import { redirect } from "next/navigation";
import { getTenantContext } from "@/lib/tenant";
import { ReservationsKanban } from "./kanban";
import type { Reservation, TableRow } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Liefert das Start/Ende des Tages in Europe/Berlin als UTC-Date.
 * date = "YYYY-MM-DD" Berlin-lokal.
 */
function berlinDayWindow(date: string): { startISO: string; endISO: string } {
  const [y, m, d] = date.split("-").map(Number);
  // Build a Date at 00:00 at Berlin using an offset probe for that day.
  const probe = new Date(Date.UTC(y, m - 1, d));
  const offMin = berlinOffsetMinutes(probe);
  const sign = offMin >= 0 ? "+" : "-";
  const abs = Math.abs(offMin);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  const startISO = new Date(`${date}T00:00:00${sign}${hh}:${mm}`).toISOString();
  const endDate = new Date(Date.UTC(y, m - 1, d + 1));
  const offMin2 = berlinOffsetMinutes(endDate);
  const s2 = offMin2 >= 0 ? "+" : "-";
  const a2 = Math.abs(offMin2);
  const h2 = String(Math.floor(a2 / 60)).padStart(2, "0");
  const m2 = String(a2 % 60).padStart(2, "0");
  const [y2, mo2, d2] = [endDate.getUTCFullYear(), endDate.getUTCMonth() + 1, endDate.getUTCDate()];
  const endStr = `${y2}-${String(mo2).padStart(2, "0")}-${String(d2).padStart(2, "0")}`;
  const endISO = new Date(`${endStr}T00:00:00${s2}${h2}:${m2}`).toISOString();
  return { startISO, endISO };
}

function berlinOffsetMinutes(d: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(d);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const mm = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const berlinMinutes = h * 60 + mm;
  const utcMinutes = d.getUTCHours() * 60 + d.getUTCMinutes();
  let diff = berlinMinutes - utcMinutes;
  if (diff < -720) diff += 1440;
  if (diff > 720) diff -= 1440;
  return diff;
}

function todayInBerlin(): string {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${g("year")}-${g("month")}-${g("day")}`;
}

export default async function ReservationsPage({
  searchParams,
}: { searchParams: Promise<{ date?: string }> }) {
  const ctx = await getTenantContext();
  if (!ctx) redirect("/login");
  const { supabase, restaurantId } = ctx;

  const sp = await searchParams;
  const today = todayInBerlin();
  const selectedDate =
    sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : today;
  const { startISO, endISO } = berlinDayWindow(selectedDate);

  const [{ data: reservations }, { data: tables }, { count: openGlobal }] = await Promise.all([
    supabase.from("reservations").select("*")
      .eq("restaurant_id", restaurantId)
      .gte("starts_at", startISO)
      .lt("starts_at", endISO)
      .order("starts_at"),
    supabase.from("tables").select("id, label").eq("restaurant_id", restaurantId),
    supabase.from("reservations")
      .select("*", { count: "exact", head: true })
      .eq("restaurant_id", restaurantId)
      .eq("status", "Offen"),
  ]);

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>
      <ReservationsKanban
        initial={(reservations ?? []) as Reservation[]}
        tables={(tables ?? []) as Pick<TableRow, "id" | "label">[]}
        selectedDate={selectedDate}
        today={today}
        totalOpenGlobal={openGlobal ?? 0}
        restaurantId={restaurantId}
        dayStartISO={startISO}
        dayEndISO={endISO}
      />
    </div>
  );
}
