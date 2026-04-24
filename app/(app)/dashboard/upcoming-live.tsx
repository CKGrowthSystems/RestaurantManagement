"use client";
import Link from "next/link";
import { useRealtimeList } from "@/lib/supabase/realtime";
import { HiBtn, HiCard, HiIcon, HiPill, HiSource } from "@/components/primitives";
import type { Reservation } from "@/lib/types";

/**
 * „Naechste Ankuenfte" auf dem Dashboard — live, exklusive Storniert/No-Show,
 * per Klick springt man in die Reservierungen-Kanban (mit geoeffnetem Edit-Modal).
 */
export function UpcomingArrivalsLive({
  initial, restaurantId, tables, dayStartISO, dayEndISO,
}: {
  initial: Reservation[];
  restaurantId: string;
  tables: { id: string; label: string }[];
  dayStartISO: string;
  dayEndISO: string;
}) {
  const [items] = useRealtimeList<Reservation>("reservations", restaurantId, initial, {
    onInsert: (row) => {
      const t = new Date(row.starts_at).getTime();
      return t >= new Date(dayStartISO).getTime() && t < new Date(dayEndISO).getTime();
    },
  });

  const now = Date.now();
  const upcoming = items
    .filter((r) => r.status !== "Storniert" && r.status !== "No-Show" && r.status !== "Abgeschlossen")
    .filter((r) => new Date(r.starts_at).getTime() >= now - 5 * 60_000)
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
    .slice(0, 5);

  return (
    <HiCard style={{ padding: 0, display: "flex", flexDirection: "column" }}>
      <div style={{
        padding: "14px 18px", borderBottom: "1px solid var(--hi-line)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--hi-ink)" }}>Nächste Ankünfte</div>
          <div style={{ fontSize: 11.5, color: "var(--hi-muted)" }}>Live · klick = bearbeiten</div>
        </div>
        <Link href="/reservations"><HiBtn kind="ghost" size="sm">Alle</HiBtn></Link>
      </div>
      <div style={{ padding: "8px 10px", display: "flex", flexDirection: "column" }}>
        {upcoming.length === 0 && (
          <div style={{ padding: 20, color: "var(--hi-muted)", fontSize: 13 }}>
            Keine anstehenden Reservierungen.
          </div>
        )}
        {upcoming.map((r, i) => {
          const table = tables.find((t) => t.id === r.table_id);
          return (
            <Link
              key={r.id}
              href={`/reservations?edit=${r.id}`}
              className="hi-upcoming-row"
              style={{
                padding: "10px 10px",
                display: "grid", gridTemplateColumns: "58px 1fr auto",
                gap: 10, alignItems: "center",
                borderBottom: i < upcoming.length - 1 ? "1px solid var(--hi-line)" : "none",
                textDecoration: "none",
                color: "inherit",
                borderRadius: 6,
                transition: "background 120ms ease",
                cursor: "pointer",
              }}
            >
              <div>
                <div className="mono" style={{ fontSize: 14, fontWeight: 600, color: "var(--hi-ink)", letterSpacing: -0.3 }}>
                  {new Date(r.starts_at).toLocaleTimeString("de-DE", {
                    hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin",
                  })}
                </div>
                <div style={{ fontSize: 10, color: "var(--hi-muted)" }}>
                  {formatRelative(new Date(r.starts_at))}
                </div>
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{
                  fontSize: 12.5, fontWeight: 500, color: "var(--hi-ink)",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {r.guest_name}
                </div>
                <div style={{ fontSize: 11, color: "var(--hi-muted)", display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                  <span>{r.party_size}P</span>·<span>{table?.label ?? "—"}</span>·<HiSource src={r.source} />
                </div>
              </div>
              {r.status === "Eingetroffen" ? (
                <HiPill tone="success" dot>Da</HiPill>
              ) : r.auto_assigned && r.approval_reason ? (
                <HiPill tone="warn" dot>Hinweis</HiPill>
              ) : (
                <HiIcon kind="chevron" size={15} style={{ color: "var(--hi-muted)" }} />
              )}
            </Link>
          );
        })}
      </div>
    </HiCard>
  );
}

function formatRelative(d: Date): string {
  const diffMin = Math.round((d.getTime() - Date.now()) / 60_000);
  if (diffMin < -1) return `vor ${Math.abs(diffMin)}m`;
  if (diffMin <= 1) return "jetzt";
  if (diffMin < 60) return `in ${diffMin}m`;
  const h = Math.floor(diffMin / 60);
  const m = diffMin % 60;
  return m === 0 ? `in ${h}h` : `in ${h}h ${m}m`;
}
