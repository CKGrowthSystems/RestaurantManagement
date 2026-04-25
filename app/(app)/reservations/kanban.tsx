"use client";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";
import { HiBtn, HiCard, HiIcon, HiPill, HiSource } from "@/components/primitives";
import { Topbar } from "@/components/shell";
import type { Reservation, ReservationStatus, TableRow } from "@/lib/types";
import { ReservationEditModal } from "./edit-modal";
import { WalkInModal } from "./walkin-modal";
import { useRealtimeList } from "@/lib/supabase/realtime";

type ColDef = { key: ReservationStatus; tone: "warn" | "accent" | "success" | "neutral" | "danger"; subtitle: string; conditional?: boolean };
const COLS: ColDef[] = [
  { key: "Angefragt",     tone: "warn",    subtitle: "Freigabe erforderlich", conditional: true },
  { key: "Bestätigt",     tone: "accent",  subtitle: "Erwartet" },
  { key: "Eingetroffen",  tone: "success", subtitle: "Am Tisch" },
  { key: "Abgeschlossen", tone: "neutral", subtitle: "Fertig" },
];

/** Shift a YYYY-MM-DD string by N days (UTC math, calendar-accurate). */
function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const out = new Date(Date.UTC(y, m - 1, d + days));
  return `${out.getUTCFullYear()}-${String(out.getUTCMonth() + 1).padStart(2, "0")}-${String(out.getUTCDate()).padStart(2, "0")}`;
}

export function ReservationsKanban({
  initial, tables, zones = [], selectedDate, today, totalOpenGlobal,
  restaurantId, dayStartISO, dayEndISO,
}: {
  initial: Reservation[];
  tables: Pick<TableRow, "id" | "label">[];
  zones?: { id: string; name: string }[];
  selectedDate: string;
  today: string;
  totalOpenGlobal: number;
  restaurantId: string;
  dayStartISO: string;
  dayEndISO: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [dragId, setDragId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Reservation | null>(null);
  const [pulseId, setPulseId] = useState<string | null>(null);
  const [showWalkIn, setShowWalkIn] = useState(false);

  // Real-time: neue Voice-KI-Buchungen / Updates / Stornos kommen live rein,
  // ohne manuelles Refreshen. Events ausserhalb des aktuell ausgewaehlten
  // Tages werden ignoriert — sonst wuerde eine Buchung fuer morgen beim
  // Ansehen von heute aufploppen.
  const [items, setItems] = useRealtimeList<Reservation>("reservations", restaurantId, initial, {
    onInsert: (row) => {
      const t = new Date(row.starts_at).getTime();
      const inRange = t >= new Date(dayStartISO).getTime() && t < new Date(dayEndISO).getTime();
      if (inRange) {
        setPulseId(row.id);
        setTimeout(() => setPulseId((id) => (id === row.id ? null : id)), 2500);
      }
      return inRange;
    },
  });

  function goToDate(next: string) {
    const params = new URLSearchParams();
    if (next !== today) params.set("date", next);
    const qs = params.toString();
    router.push(`/reservations${qs ? `?${qs}` : ""}`);
  }

  const isToday = selectedDate === today;
  const [y, m, d] = selectedDate.split("-").map(Number);
  const dayLabel = new Intl.DateTimeFormat("de-DE", {
    weekday: "short", day: "numeric", month: "short",
    timeZone: "Europe/Berlin",
  }).format(new Date(Date.UTC(y, m - 1, d, 12)));
  const otherDayOpen = !isToday ? totalOpenGlobal : 0;

  function label(id: string | null) {
    if (!id) return "—";
    return tables.find((t) => t.id === id)?.label ?? "—";
  }

  async function move(id: string, status: ReservationStatus) {
    setItems((prev) => prev.map((r) =>
      r.id === id ? { ...r, status, auto_assigned: status === "Bestätigt" ? false : r.auto_assigned, approval_reason: status === "Bestätigt" ? null : r.approval_reason } : r,
    ));
    await fetch(`/api/reservations/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
    router.refresh();
  }

  // ?edit=<id> in URL => Modal sofort oeffnen (z.B. vom Dashboard aus)
  useEffect(() => {
    const editId = searchParams?.get("edit");
    if (!editId) return;
    const target = items.find((r) => r.id === editId);
    if (target) {
      setEditing(target);
      const params = new URLSearchParams(searchParams.toString());
      params.delete("edit");
      const qs = params.toString();
      router.replace(`/reservations${qs ? `?${qs}` : ""}`);
    }
  }, [searchParams, items, router]);

  // Live berechnete Counts aus aktuellem Kanban-State. Nur aktive zaehlen
  // (stornierte oder No-Show sollen nicht in die Anzeige zaehlen).
  const activeItems = items.filter((r) => r.status !== "Storniert" && r.status !== "No-Show");
  const totalCount = activeItems.length;
  const pendingApproval = activeItems.filter((r) => r.status === "Angefragt").length;
  const subtitle = `${isToday ? "Heute" : dayLabel} · ${totalCount} Reservierung${totalCount === 1 ? "" : "en"}${pendingApproval ? ` · ${pendingApproval} warten auf Freigabe` : ""}`;

  return (
    <>
      <Topbar
        title="Reservierungen"
        subtitle={subtitle}
        right={
          <div style={{ display: "flex", gap: 8 }}>
            <HiBtn kind="outline" size="md" icon="plus" onClick={() => setShowWalkIn(true)}>
              Walk-In
            </HiBtn>
            <Link href="/reservations/new">
              <HiBtn kind="primary" size="md" icon="plus">Neue Reservierung</HiBtn>
            </Link>
          </div>
        }
      />
      <div style={{
        padding: "14px 28px", display: "flex", gap: 10, alignItems: "center",
        borderBottom: "1px solid var(--hi-line)",
      }}>
        {/* Date navigator: prev / [date+today shortcut] / next */}
        <div style={{
          display: "flex", alignItems: "stretch",
          background: "var(--hi-surface)",
          border: "1px solid var(--hi-line)", borderRadius: 7,
          overflow: "hidden",
        }}>
          <button
            onClick={() => goToDate(shiftDate(selectedDate, -1))}
            title="Vorheriger Tag"
            style={navArrowStyle}
          >
            <HiIcon kind="chevron" size={12} style={{ transform: "rotate(180deg)" }} />
          </button>
          <div style={{
            padding: "6px 10px", display: "flex", alignItems: "center", gap: 8,
            borderLeft: "1px solid var(--hi-line)",
            borderRight: "1px solid var(--hi-line)",
            fontSize: 12,
          }}>
            <HiIcon kind="clock" size={13} style={{ color: "var(--hi-muted)" }} />
            <span style={{ color: "var(--hi-ink)", fontWeight: 500 }}>
              {isToday ? "Heute" : dayLabel}
            </span>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => { if (e.target.value) goToDate(e.target.value); }}
              style={{
                background: "transparent", border: "none",
                color: "var(--hi-muted)", fontSize: 11.5,
                fontFamily: '"Geist Mono", ui-monospace, monospace',
                outline: "none", cursor: "pointer", padding: 0,
                colorScheme: "dark",
              }}
            />
          </div>
          <button
            onClick={() => goToDate(shiftDate(selectedDate, 1))}
            title="Nächster Tag"
            style={navArrowStyle}
          >
            <HiIcon kind="chevron" size={12} />
          </button>
        </div>

        {!isToday && (
          <button
            onClick={() => goToDate(today)}
            style={{
              padding: "6px 12px", borderRadius: 7, fontSize: 12, fontWeight: 500,
              border: "1px solid var(--hi-accent)",
              background: "color-mix(in oklch, var(--hi-accent) 12%, transparent)",
              color: "var(--hi-accent)", cursor: "pointer",
              display: "inline-flex", alignItems: "center", gap: 6,
            }}
          >
            <HiIcon kind="arrow" size={11} /> Zurück zu Heute
          </button>
        )}

        {otherDayOpen > 0 && (
          <HiPill tone="warn" dot>
            {otherDayOpen} offen (alle Tage)
          </HiPill>
        )}

        <div style={{ flex: 1 }} />
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "3px 10px", borderRadius: 10,
          background: "color-mix(in oklch, oklch(0.72 0.12 145) 12%, transparent)",
          border: "1px solid color-mix(in oklch, oklch(0.72 0.12 145) 35%, var(--hi-line))",
          color: "oklch(0.8 0.12 145)",
          fontSize: 11, fontWeight: 500,
        }}>
          <span style={{
            width: 7, height: 7, borderRadius: 4,
            background: "oklch(0.72 0.12 145)",
            animation: "hi-dot-pulse 1.6s ease-in-out infinite",
          }} />
          Live
        </span>
        <span style={{ fontSize: 11.5, color: "var(--hi-muted)" }}>Drag &amp; Drop · Stift = bearbeiten</span>
      </div>

      {(() => {
        // Conditional Angefragt-Spalte: nur zeigen wenn es mind. eine Anfrage gibt.
        const visibleCols = COLS.filter((c) => {
          if (!c.conditional) return true;
          return items.some((r) => r.status === c.key);
        });
        return (
      <div style={{
        flex: 1, overflow: "auto", padding: "16px 20px",
        display: "grid", gridTemplateColumns: `repeat(${visibleCols.length}, 1fr)`, gap: 14,
      }}>
        {visibleCols.map((col) => {
          const colItems = items.filter((r) => r.status === col.key);
          return (
            <div
              key={col.key}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => { if (dragId) { move(dragId, col.key); setDragId(null); } }}
              style={{ display: "flex", flexDirection: "column", minWidth: 0 }}
            >
              <div style={{
                padding: "10px 12px", borderRadius: "10px 10px 0 0",
                background: "var(--hi-surface)", border: "1px solid var(--hi-line)", borderBottom: "none",
                display: "flex", alignItems: "center", gap: 8,
              }}>
                <HiPill tone={col.tone} dot>{col.key}</HiPill>
                <span className="mono" style={{ fontSize: 11, color: "var(--hi-muted)" }}>{colItems.length}</span>
                <span style={{ flex: 1 }} />
                <HiIcon kind="more" size={14} style={{ color: "var(--hi-muted)" }} />
              </div>
              <div className="kanban-col" style={{
                flex: 1, padding: 8, display: "flex", flexDirection: "column", gap: 8,
                background: "rgba(255,255,255,0.015)",
                border: "1px solid var(--hi-line)", borderTop: "none",
                borderRadius: "0 0 10px 10px",
              }}>
                <div style={{ fontSize: 10, color: "var(--hi-muted)", padding: "4px 4px 0", letterSpacing: 0.5 }}>
                  {col.subtitle.toUpperCase()}
                </div>
                {colItems.map((r) => (
                  <HiCard
                    key={r.id}
                    draggable
                    onDragStart={() => setDragId(r.id)}
                    onDragEnd={() => setDragId(null)}
                    interactive
                    style={{
                      padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6,
                      borderColor: pulseId === r.id
                        ? "var(--hi-accent)"
                        : r.status === "Angefragt"
                        ? "oklch(0.72 0.15 70)"
                        : r.auto_assigned && r.approval_reason
                        ? "color-mix(in oklch, oklch(0.75 0.14 70) 50%, var(--hi-line))"
                        : "var(--hi-line)",
                      background: r.status === "Angefragt"
                        ? "color-mix(in oklch, oklch(0.75 0.15 70) 8%, var(--hi-surface))"
                        : undefined,
                      boxShadow: pulseId === r.id
                        ? "0 0 0 4px color-mix(in oklch, var(--hi-accent) 20%, transparent)"
                        : undefined,
                      animation: pulseId === r.id ? "hi-pulse-fade 2.5s ease-out" : undefined,
                      cursor: "grab", position: "relative",
                    }}
                  >
                    <div
                      style={{ position: "absolute", top: 8, right: 8, display: "flex", gap: 4 }}
                      onPointerDown={(e) => e.stopPropagation()}
                    >
                      {r.status !== "Storniert" && r.status !== "Abgeschlossen" && (
                        <button
                          title="Reservierung stornieren"
                          aria-label="Reservierung stornieren"
                          onClick={(e) => {
                            e.stopPropagation();
                            const codeHint = r.code ? ` (Buchungsnummer #${r.code})` : "";
                            if (!confirm(`Reservierung von ${r.guest_name}${codeHint} stornieren?`)) return;
                            move(r.id, "Storniert");
                          }}
                          className="hi-card-action hi-card-action-danger"
                          style={{
                            width: 24, height: 24, borderRadius: 5,
                            background: "rgba(255,255,255,0.06)",
                            border: "1px solid var(--hi-line)",
                            color: "oklch(0.74 0.16 25)",
                            cursor: "pointer",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            transition: "background 120ms ease, border-color 120ms ease",
                          }}
                        >
                          <HiIcon kind="trash" size={11} />
                        </button>
                      )}
                      <button
                        title="Reservierung bearbeiten"
                        aria-label="Reservierung bearbeiten"
                        onClick={(e) => { e.stopPropagation(); setEditing(r); }}
                        style={{
                          width: 24, height: 24, borderRadius: 5,
                          background: "rgba(255,255,255,0.06)",
                          border: "1px solid var(--hi-line)",
                          color: "var(--hi-muted-strong)",
                          cursor: "pointer",
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}
                      >
                        <HiIcon kind="edit" size={11} />
                      </button>
                    </div>
                    {r.auto_assigned && r.approval_reason && r.status !== "Abgeschlossen" && r.status !== "Storniert" && (
                      <div style={{
                        padding: "4px 8px", borderRadius: 6, fontSize: 10.5,
                        background: "color-mix(in oklch, oklch(0.75 0.14 70) 15%, transparent)",
                        color: "oklch(0.82 0.13 70)",
                        border: "1px solid color-mix(in oklch, oklch(0.75 0.14 70) 35%, var(--hi-line))",
                        lineHeight: 1.3,
                      }}>
                        ⚠︎ {r.approval_reason}
                      </div>
                    )}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, paddingRight: 64 }}>
                      <span className="mono" style={{ fontSize: 14, fontWeight: 600, color: "var(--hi-ink)", letterSpacing: -0.3 }}>
                        {new Date(r.starts_at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" })}
                      </span>
                      <span className="mono" style={{
                        fontSize: 11, color: "var(--hi-muted)",
                        background: "rgba(255,255,255,0.05)", padding: "1px 6px", borderRadius: 4,
                      }}>
                        {label(r.table_id)}
                      </span>
                    </div>
                    <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--hi-ink)", lineHeight: 1.3, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <span>{r.guest_name} <span style={{ color: "var(--hi-muted)", fontWeight: 400 }}>· {r.party_size}P</span></span>
                      {r.code && (
                        <span
                          className="mono allow-select"
                          title="Buchungsnummer (vom Gast bei Storno-Anrufen verwendbar)"
                          style={{
                            fontSize: 10, fontWeight: 600,
                            padding: "1px 6px", borderRadius: 4,
                            background: "color-mix(in oklch, var(--hi-accent) 12%, transparent)",
                            color: "var(--hi-accent)",
                            border: "1px solid color-mix(in oklch, var(--hi-accent) 30%, var(--hi-line))",
                          }}
                        >
                          #{r.code}
                        </span>
                      )}
                    </div>
                    {r.note && (
                      <div style={{ fontSize: 11, color: "var(--hi-muted)", lineHeight: 1.4 }}>{r.note}</div>
                    )}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 2, gap: 6 }}>
                      <HiSource src={r.source} />
                      {r.status === "Angefragt" && (
                        <div style={{ display: "flex", gap: 5 }}>
                          <HiBtn
                            kind="danger" size="sm" icon="x"
                            onClick={() => {
                              if (!confirm(`Reservierung von ${r.guest_name} ablehnen?`)) return;
                              move(r.id, "Storniert");
                            }}
                          >
                            Ablehnen
                          </HiBtn>
                          <HiBtn kind="primary" size="sm" icon="check" onClick={() => move(r.id, "Bestätigt")}>
                            Freigeben
                          </HiBtn>
                        </div>
                      )}
                      {r.status === "Bestätigt" && (
                        <HiBtn kind="outline" size="sm" icon="check" onClick={() => move(r.id, "Eingetroffen")}>
                          Eingetroffen
                        </HiBtn>
                      )}
                    </div>
                  </HiCard>
                ))}
                {colItems.length === 0 && (
                  <div style={{
                    padding: 14, borderRadius: 8,
                    border: "1.4px dashed var(--hi-line)",
                    color: "var(--hi-muted)", fontSize: 12, textAlign: "center",
                  }}>
                    Leer
                  </div>
                )}
                {col.key === "Bestätigt" && (
                  <Link href="/reservations/new">
                    <button style={{
                      width: "100%",
                      padding: 10, border: "1.4px dashed var(--hi-line)", borderRadius: 8,
                      background: "transparent", color: "var(--hi-muted)", fontSize: 12,
                      cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                    }}>
                      <HiIcon kind="plus" size={13} /> Neue Reservierung
                    </button>
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
        );
      })()}
      {editing && (
        <ReservationEditModal
          reservation={editing}
          tables={tables as any}
          onClose={() => setEditing(null)}
          onSaved={(next) => {
            setItems((prev) => prev.map((r) => (r.id === next.id ? next : r)));
            router.refresh();
          }}
          onDeleted={(id) => {
            setItems((prev) => prev.map((r) => (r.id === id ? { ...r, status: "Storniert" } : r)));
            router.refresh();
          }}
        />
      )}
      {showWalkIn && (
        <WalkInModal
          zones={zones}
          onClose={() => setShowWalkIn(false)}
          onPlaced={() => router.refresh()}
        />
      )}
    </>
  );
}

const navArrowStyle: React.CSSProperties = {
  width: 32, display: "flex", alignItems: "center", justifyContent: "center",
  background: "transparent", border: "none", cursor: "pointer",
  color: "var(--hi-muted-strong)",
};
