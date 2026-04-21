"use client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { HiBtn, HiCard, HiIcon, HiPill, HiSource } from "@/components/primitives";
import type { Reservation, ReservationStatus, TableRow } from "@/lib/types";
import { ReservationEditModal } from "./edit-modal";

const COLS: { key: ReservationStatus; tone: "warn" | "accent" | "success" | "neutral"; subtitle: string }[] = [
  { key: "Offen",         tone: "warn",    subtitle: "Bestätigung erforderlich" },
  { key: "Bestätigt",     tone: "accent",  subtitle: "Erwartet" },
  { key: "Eingetroffen",  tone: "success", subtitle: "Am Tisch" },
  { key: "Abgeschlossen", tone: "neutral", subtitle: "Heute fertig" },
];

export function ReservationsKanban({
  initial, tables,
}: { initial: Reservation[]; tables: Pick<TableRow, "id" | "label">[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [dragId, setDragId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Reservation | null>(null);

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

  return (
    <>
      <div style={{
        padding: "14px 28px", display: "flex", gap: 10, alignItems: "center",
        borderBottom: "1px solid var(--hi-line)",
      }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "5px 12px", background: "var(--hi-surface)",
          border: "1px solid var(--hi-line)", borderRadius: 7, fontSize: 12,
        }}>
          <HiIcon kind="clock" size={13} style={{ color: "var(--hi-muted)" }} />
          <span style={{ color: "var(--hi-ink)", fontWeight: 500 }}>
            Heute, {new Date().toLocaleDateString("de-DE", { day: "numeric", month: "short" })}
          </span>
        </div>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11.5, color: "var(--hi-muted)" }}>Drag &amp; Drop zum Statuswechsel</span>
      </div>

      <div style={{
        flex: 1, overflow: "auto", padding: "16px 20px",
        display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14,
      }}>
        {COLS.map((col) => {
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
                      borderColor: r.auto_assigned && r.status === "Offen"
                        ? "color-mix(in oklch, oklch(0.75 0.14 70) 50%, var(--hi-line))"
                        : r.status === "Offen"
                        ? "color-mix(in oklch, var(--hi-accent) 30%, var(--hi-line))"
                        : "var(--hi-line)",
                      cursor: "grab", position: "relative",
                    }}
                  >
                    <button
                      title="Reservierung bearbeiten"
                      onClick={(e) => { e.stopPropagation(); setEditing(r); }}
                      onPointerDown={(e) => e.stopPropagation()}
                      style={{
                        position: "absolute", top: 8, right: 8,
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
                    {r.auto_assigned && r.status === "Offen" && r.approval_reason && (
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
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                      <span className="mono" style={{ fontSize: 14, fontWeight: 600, color: "var(--hi-ink)", letterSpacing: -0.3 }}>
                        {new Date(r.starts_at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      <span className="mono" style={{
                        fontSize: 11, color: "var(--hi-muted)",
                        background: "rgba(255,255,255,0.05)", padding: "1px 6px", borderRadius: 4,
                      }}>
                        {label(r.table_id)}
                      </span>
                    </div>
                    <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--hi-ink)", lineHeight: 1.3 }}>
                      {r.guest_name} <span style={{ color: "var(--hi-muted)", fontWeight: 400 }}>· {r.party_size}P</span>
                    </div>
                    {r.note && (
                      <div style={{ fontSize: 11, color: "var(--hi-muted)", lineHeight: 1.4 }}>{r.note}</div>
                    )}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 2 }}>
                      <HiSource src={r.source} />
                      {r.status === "Offen" && (
                        <HiBtn kind="primary" size="sm" icon="check" onClick={() => move(r.id, "Bestätigt")}>
                          Bestätigen
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
                {col.key === "Offen" && (
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
    </>
  );
}
