"use client";
import Link from "next/link";
import { HiIcon } from "@/components/primitives";
import { useRealtimeCount } from "@/lib/supabase/realtime";

/**
 * Prominente rote Warn-Leiste oben auf dem Dashboard, wenn Reservierungen
 * auf Freigabe warten (status=Angefragt). Klick navigiert in den Kanban,
 * der den Nutzer automatisch in die Angefragt-Spalte scrollt.
 */
export function ApprovalBanner({
  restaurantId, initialCount,
}: { restaurantId: string; initialCount: number }) {
  const count = useRealtimeCount("reservations", restaurantId, initialCount, {
    filter: (q) => q.eq("status", "Angefragt"),
    additionalFilterString: "status=Angefragt",
  });

  if (count === 0) return null;

  return (
    <Link
      href="/reservations"
      style={{
        display: "flex", alignItems: "center", gap: 14,
        padding: "14px 28px",
        borderBottom: "1px solid color-mix(in oklch, oklch(0.72 0.15 70) 45%, var(--hi-line))",
        background: "color-mix(in oklch, oklch(0.72 0.15 70) 14%, var(--hi-surface))",
        color: "var(--hi-ink)",
        textDecoration: "none",
        cursor: "pointer",
        transition: "background 120ms ease",
      }}
    >
      <div style={{
        width: 32, height: 32, borderRadius: 8,
        background: "color-mix(in oklch, oklch(0.72 0.15 70) 25%, transparent)",
        color: "oklch(0.85 0.14 70)",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
      }}>
        <HiIcon kind="bell" size={16} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: "oklch(0.88 0.12 70)" }}>
          {count} Reservierung{count === 1 ? "" : "en"} warte{count === 1 ? "t" : "n"} auf Freigabe
        </div>
        <div style={{ fontSize: 11.5, color: "color-mix(in oklch, oklch(0.85 0.12 70) 70%, var(--hi-muted))" }}>
          Stammtisch / VIP-Tisch — jetzt bestätigen oder ablehnen
        </div>
      </div>
      <div style={{
        padding: "6px 12px", borderRadius: 7,
        background: "oklch(0.72 0.15 70)",
        color: "#1a1209",
        fontSize: 12, fontWeight: 600,
        display: "inline-flex", alignItems: "center", gap: 5,
      }}>
        Öffnen <HiIcon kind="chevron" size={11} />
      </div>
    </Link>
  );
}
