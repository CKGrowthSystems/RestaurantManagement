"use client";
import { useState } from "react";
import { HiIcon } from "@/components/primitives";
import type { Floor, TableRow, Zone } from "@/lib/types";

interface Props {
  floors: Floor[];
  zones: Zone[];
  tables: TableRow[];
  onClose: () => void;
  onChanged: () => void;
}

/**
 * Zentrale Verwaltung aller Bereiche ueber alle Raeume hinweg.
 * Zeigt eine Liste aller Zonen, gruppiert nach Raum.
 * Pro Zone: Name, Anzahl Tische, Umbenennen, Loeschen.
 */
export function ZoneManagerModal({ floors, zones, tables, onClose, onChanged }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const grouped = floors
    .map((f) => ({
      floor: f,
      zones: zones
        .filter((z) => z.floor_id === f.id)
        .sort((a, b) => a.sort_order - b.sort_order),
    }))
    .filter((g) => g.zones.length > 0);
  const zonesWithoutFloor = zones.filter((z) => !z.floor_id);

  async function rename(id: string, current: string) {
    const name = prompt("Neuer Name:", current);
    if (!name || name === current) return;
    setBusy(id); setError(null);
    const res = await fetch(`/api/zones/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setBusy(null);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
      return;
    }
    onChanged();
  }

  async function remove(id: string, name: string) {
    const count = tables.filter((t) => t.zone_id === id).length;
    const msg = count > 0
      ? `Bereich „${name}" löschen? ${count} Tisch${count === 1 ? "" : "e"} in diesem Bereich werden zonenlos (bleiben erhalten).`
      : `Bereich „${name}" wirklich löschen?`;
    if (!confirm(msg)) return;
    setBusy(id); setError(null);
    const res = await fetch(`/api/zones/${id}`, { method: "DELETE" });
    setBusy(null);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
      return;
    }
    onChanged();
  }

  /** Loescht alle Zonen mit demselben Namen ueber alle Raeume. */
  async function removeByName(name: string) {
    const matches = zones.filter((z) => z.name === name);
    if (matches.length <= 1) return remove(matches[0].id, name);
    const totalTables = tables.filter((t) => matches.some((z) => z.id === t.zone_id)).length;
    if (!confirm(`„${name}" existiert in ${matches.length} Räumen. Alle löschen? ${totalTables} Tisch${totalTables === 1 ? "" : "e"} verlieren dabei ihren Bereich.`)) return;
    setBusy(`bulk-${name}`); setError(null);
    const results = await Promise.all(
      matches.map((z) => fetch(`/api/zones/${z.id}`, { method: "DELETE" }).then((r) => r.ok))
    );
    setBusy(null);
    if (results.some((ok) => !ok)) {
      setError(`${results.filter((ok) => !ok).length} Bereich(e) konnten nicht gelöscht werden.`);
    }
    onChanged();
  }

  const duplicateNames = Array.from(new Set(
    zones
      .map((z) => z.name)
      .filter((n, i, arr) => arr.indexOf(n) !== arr.lastIndexOf(n))
  ));

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 680,
          background: "var(--hi-surface)",
          border: "1px solid var(--hi-line)",
          borderRadius: 12,
          overflow: "hidden",
          display: "flex", flexDirection: "column",
          maxHeight: "88vh",
        }}
      >
        <div style={{
          padding: "16px 22px", borderBottom: "1px solid var(--hi-line)",
          display: "flex", alignItems: "center", gap: 12,
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: 8,
            background: "color-mix(in oklch, var(--hi-accent) 18%, var(--hi-surface))",
            color: "var(--hi-accent)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <HiIcon kind="floor" size={17} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--hi-ink)" }}>Bereiche verwalten</div>
            <div style={{ fontSize: 11.5, color: "var(--hi-muted)" }}>
              Alle Bereiche über alle Räume · umbenennen oder löschen
            </div>
          </div>
          <button onClick={onClose} style={closeBtn}><HiIcon kind="x" size={13} /></button>
        </div>

        {error && (
          <div style={{
            margin: "12px 22px 0",
            padding: "8px 12px", borderRadius: 7, fontSize: 12,
            background: "color-mix(in oklch, oklch(0.66 0.2 25) 15%, transparent)",
            color: "oklch(0.8 0.15 25)",
            border: "1px solid color-mix(in oklch, oklch(0.66 0.2 25) 40%, var(--hi-line))",
          }}>
            {error}
          </div>
        )}

        {duplicateNames.length > 0 && (
          <div style={{
            margin: "12px 22px 0",
            padding: "10px 12px", borderRadius: 7, fontSize: 12,
            background: "color-mix(in oklch, var(--hi-warn) 12%, transparent)",
            color: "oklch(0.82 0.12 70)",
            border: "1px solid color-mix(in oklch, var(--hi-warn) 35%, var(--hi-line))",
          }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>
              Gleichnamige Bereiche in mehreren Räumen
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
              {duplicateNames.map((n) => (
                <button
                  key={n}
                  onClick={() => removeByName(n)}
                  disabled={busy === `bulk-${n}`}
                  style={{
                    padding: "4px 9px", borderRadius: 5, fontSize: 11, fontWeight: 500,
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid color-mix(in oklch, oklch(0.66 0.2 25) 40%, var(--hi-line))",
                    color: "oklch(0.75 0.17 25)",
                    cursor: "pointer",
                    display: "inline-flex", alignItems: "center", gap: 5,
                  }}
                >
                  <HiIcon kind="trash" size={10} />
                  „{n}" in allen Räumen löschen
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={{ padding: 22, overflowY: "auto", display: "flex", flexDirection: "column", gap: 18 }}>
          {grouped.length === 0 && zonesWithoutFloor.length === 0 && (
            <div style={{ padding: 14, fontSize: 13, color: "var(--hi-muted)", textAlign: "center" }}>
              Noch keine Bereiche angelegt.
            </div>
          )}

          {grouped.map(({ floor, zones: zs }) => (
            <ZoneGroup
              key={floor.id}
              title={floor.name}
              zones={zs}
              tables={tables}
              busy={busy}
              onRename={rename}
              onDelete={remove}
            />
          ))}

          {zonesWithoutFloor.length > 0 && (
            <ZoneGroup
              title="Ohne Raum-Zuordnung"
              zones={zonesWithoutFloor}
              tables={tables}
              busy={busy}
              onRename={rename}
              onDelete={remove}
              muted
            />
          )}
        </div>

        <div style={{
          padding: "12px 22px", borderTop: "1px solid var(--hi-line)",
          background: "var(--hi-bg)",
          display: "flex", gap: 10, alignItems: "center",
          fontSize: 11.5, color: "var(--hi-muted)",
        }}>
          <HiIcon kind="clock" size={12} />
          <span>Beim Löschen werden zugeordnete Tische nicht gelöscht, sondern nur „zonenlos".</span>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={closeFootBtn}>Schließen</button>
        </div>
      </div>
    </div>
  );
}

function ZoneGroup({
  title, zones, tables, busy, onRename, onDelete, muted,
}: {
  title: string;
  zones: Zone[];
  tables: TableRow[];
  busy: string | null;
  onRename: (id: string, current: string) => void;
  onDelete: (id: string, name: string) => void;
  muted?: boolean;
}) {
  return (
    <div>
      <div style={{
        fontSize: 11, fontWeight: 600, letterSpacing: 0.8, textTransform: "uppercase",
        color: muted ? "var(--hi-muted)" : "var(--hi-ink)",
        marginBottom: 8,
      }}>
        {title}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {zones.map((z) => {
          const count = tables.filter((t) => t.zone_id === z.id).length;
          const isBusy = busy === z.id;
          return (
            <div key={z.id} style={{
              display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: 10,
              padding: "9px 12px", borderRadius: 8,
              background: "var(--hi-surface-raised)",
              border: "1px solid var(--hi-line)",
              alignItems: "center",
            }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: "var(--hi-ink)" }}>{z.name}</div>
                <div style={{ fontSize: 10.5, color: "var(--hi-muted)", fontFamily: '"Geist Mono", monospace' }}>
                  {z.bbox_w}×{z.bbox_h}px · pos {z.bbox_x},{z.bbox_y}
                </div>
              </div>
              <span style={{
                fontSize: 10.5, fontWeight: 500,
                color: count > 0 ? "var(--hi-ink)" : "var(--hi-muted)",
                background: "rgba(255,255,255,0.05)",
                padding: "2px 8px", borderRadius: 10,
                fontFamily: '"Geist Mono", monospace',
              }}>
                {count} Tisch{count === 1 ? "" : "e"}
              </span>
              <button
                onClick={() => onRename(z.id, z.name)}
                disabled={isBusy}
                title="Umbenennen"
                style={iconBtn}
              >
                <HiIcon kind="edit" size={11} />
              </button>
              <button
                onClick={() => onDelete(z.id, z.name)}
                disabled={isBusy}
                title="Löschen"
                style={{
                  ...iconBtn,
                  color: "oklch(0.75 0.18 25)",
                  borderColor: "color-mix(in oklch, oklch(0.66 0.2 25) 30%, var(--hi-line))",
                }}
              >
                <HiIcon kind="trash" size={11} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const iconBtn: React.CSSProperties = {
  width: 28, height: 28, borderRadius: 6,
  background: "transparent", border: "1px solid var(--hi-line)",
  color: "var(--hi-muted-strong)",
  cursor: "pointer",
  display: "flex", alignItems: "center", justifyContent: "center",
};
const closeBtn: React.CSSProperties = {
  width: 30, height: 30, borderRadius: 7,
  background: "transparent", border: "1px solid var(--hi-line)",
  color: "var(--hi-muted)", cursor: "pointer",
  display: "flex", alignItems: "center", justifyContent: "center",
};
const closeFootBtn: React.CSSProperties = {
  padding: "6px 12px", borderRadius: 7, fontSize: 12, fontWeight: 500,
  border: "1px solid var(--hi-line)", background: "var(--hi-surface-raised)",
  color: "var(--hi-ink)", cursor: "pointer",
};
