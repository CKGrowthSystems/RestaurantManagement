"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { HiBtn, HiCard, HiIcon, HiPill, HiTable, HiField, type TableStatus } from "@/components/primitives";
import type { TableRow, Zone } from "@/lib/types";

interface LiveReservation {
  table_id: string | null;
  status: string;
  starts_at: string;
  duration_min: number;
}

const SHAPES = [{ id: "round", label: "Rund" }, { id: "square", label: "Eckig" }] as const;

function statusAt(tableId: string, rs: LiveReservation[]): TableStatus {
  const now = Date.now();
  const active = rs.find((r) => r.table_id === tableId
    && r.status !== "Storniert" && r.status !== "No-Show" && r.status !== "Abgeschlossen");
  if (!active) return "free";
  const start = new Date(active.starts_at).getTime();
  const end = start + active.duration_min * 60_000;
  if (now >= start && now <= end) {
    return active.status === "Eingetroffen" ? "seated" : "reserved";
  }
  if (active.status === "Bestätigt" && now < start) return "reserved";
  return "free";
}

export function TablesClient({
  initialTables, zones, todayReservations,
}: {
  initialTables: TableRow[];
  zones: Zone[];
  todayReservations: LiveReservation[];
}) {
  const router = useRouter();
  const [tables, setTables] = useState(initialTables);
  const [zoneFilter, setZoneFilter] = useState<string | null>(null);
  const [editing, setEditing] = useState<TableRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  const filtered = useMemo(
    () => tables.filter((t) => !zoneFilter || t.zone_id === zoneFilter),
    [tables, zoneFilter],
  );

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function toggleAllFiltered() {
    const allIds = filtered.map((t) => t.id);
    const allSelected = allIds.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) { allIds.forEach((id) => next.delete(id)); }
      else { allIds.forEach((id) => next.add(id)); }
      return next;
    });
  }
  function clearSelection() { setSelected(new Set()); }

  async function deleteTable(id: string) {
    if (!confirm("Tisch wirklich löschen?")) return;
    const res = await fetch(`/api/tables/${id}`, { method: "DELETE" });
    if (res.ok) {
      setTables((prev) => prev.filter((t) => t.id !== id));
      setSelected((prev) => { const n = new Set(prev); n.delete(id); return n; });
      router.refresh();
    }
  }

  async function deleteSelected() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (!confirm(`${ids.length} Tisch${ids.length === 1 ? "" : "e"} wirklich löschen? Das kann nicht rueckgaengig gemacht werden.`)) return;
    setDeleting(true);
    const results = await Promise.all(
      ids.map((id) => fetch(`/api/tables/${id}`, { method: "DELETE" }).then((r) => ({ id, ok: r.ok })))
    );
    const okIds = new Set(results.filter((r) => r.ok).map((r) => r.id));
    setTables((prev) => prev.filter((t) => !okIds.has(t.id)));
    const failed = results.filter((r) => !r.ok).length;
    setDeleting(false);
    clearSelection();
    if (failed > 0) alert(`${failed} Tisch(e) konnten nicht geloescht werden.`);
    router.refresh();
  }

  const allFilteredSelected = filtered.length > 0 && filtered.every((t) => selected.has(t.id));
  const someFilteredSelected = filtered.some((t) => selected.has(t.id)) && !allFilteredSelected;

  return (
    <>
      <div
        style={{
          padding: "14px 28px", display: "flex", gap: 8, alignItems: "center",
          borderBottom: "1px solid var(--hi-line)",
        }}
      >
        <div style={{ display: "flex", gap: 4 }}>
          <FilterBtn active={zoneFilter === null} onClick={() => setZoneFilter(null)}>
            Alle <span style={{ opacity: 0.5, marginLeft: 4 }}>{tables.length}</span>
          </FilterBtn>
          {zones.map((z) => (
            <FilterBtn key={z.id} active={zoneFilter === z.id} onClick={() => setZoneFilter(z.id)}>
              {z.name}{" "}
              <span style={{ opacity: 0.5, marginLeft: 4 }}>
                {tables.filter((t) => t.zone_id === z.id).length}
              </span>
            </FilterBtn>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        {selected.size > 0 && (
          <>
            <span style={{
              fontSize: 12, color: "var(--hi-muted-strong)",
              padding: "6px 10px", background: "var(--hi-surface)",
              border: "1px solid var(--hi-line)", borderRadius: 7,
            }}>
              <span className="mono" style={{ color: "var(--hi-accent)", fontWeight: 600 }}>
                {selected.size}
              </span>{" "}
              ausgewählt
            </span>
            <HiBtn kind="ghost" size="md" onClick={clearSelection}>Auswahl leeren</HiBtn>
            <HiBtn kind="danger" size="md" icon="trash" onClick={deleteSelected} disabled={deleting}>
              {deleting ? "Lösche…" : `${selected.size} löschen`}
            </HiBtn>
          </>
        )}
        <HiBtn kind="primary" size="md" icon="plus" onClick={() => setCreating(true)}>
          Tisch anlegen
        </HiBtn>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "0 28px 28px" }}>
        <table className="hi-table" style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 13 }}>
          <thead>
            <tr style={{ position: "sticky", top: 0, background: "var(--hi-bg)", zIndex: 1 }}>
              <th style={{ padding: "12px 10px 10px 14px", borderBottom: "1px solid var(--hi-line)", width: 36 }}>
                <input
                  type="checkbox"
                  aria-label="Alle ausgewaehlten Tische markieren"
                  checked={allFilteredSelected}
                  ref={(el) => { if (el) el.indeterminate = someFilteredSelected; }}
                  onChange={toggleAllFiltered}
                  style={{ accentColor: "var(--hi-accent)", cursor: "pointer" }}
                />
              </th>
              {["Tisch", "Bereich", "Plätze", "Form", "Attribute", "Status jetzt", "Notiz", ""].map((h, i) => (
                <th key={i} style={{
                  textAlign: "left", padding: "12px 14px 10px",
                  fontSize: 10.5, fontWeight: 600, color: "var(--hi-muted)",
                  letterSpacing: 0.8, textTransform: "uppercase",
                  borderBottom: "1px solid var(--hi-line)",
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((t) => {
              const status = statusAt(t.id, todayReservations);
              const zone = zones.find((z) => z.id === t.zone_id);
              const isSel = selected.has(t.id);
              return (
                <tr key={t.id} style={{
                  background: isSel ? "color-mix(in oklch, var(--hi-accent) 8%, transparent)" : undefined,
                }}>
                  <td style={{ padding: "10px 10px 10px 14px", borderBottom: "1px solid var(--hi-line)" }}>
                    <input
                      type="checkbox"
                      checked={isSel}
                      onChange={() => toggleOne(t.id)}
                      aria-label={`Tisch ${t.label} ausgewaehlt`}
                      style={{ accentColor: "var(--hi-accent)", cursor: "pointer" }}
                    />
                  </td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--hi-line)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <HiTable shape={t.shape} seats={t.seats} label={t.label} status={status} size={36} />
                      <span className="mono" style={{ fontWeight: 600, color: "var(--hi-ink)" }}>{t.label}</span>
                    </div>
                  </td>
                  <td style={{ padding: "10px 14px", color: "var(--hi-muted-strong)", borderBottom: "1px solid var(--hi-line)" }}>
                    {zone?.name ?? "—"}
                  </td>
                  <td className="mono" style={{ padding: "10px 14px", color: "var(--hi-ink)", borderBottom: "1px solid var(--hi-line)" }}>
                    {t.seats}
                  </td>
                  <td style={{ padding: "10px 14px", color: "var(--hi-muted-strong)", borderBottom: "1px solid var(--hi-line)" }}>
                    {t.shape === "round" ? "Rund" : "Eckig"}
                  </td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--hi-line)" }}>
                    <div style={{ display: "flex", gap: 4 }}>
                      {t.accessible && <HiPill tone="neutral">♿</HiPill>}
                      {t.notes?.toLowerCase().includes("fenster") && <HiPill tone="neutral">Fenster</HiPill>}
                      {t.notes?.toLowerCase().includes("raucher") && <HiPill tone="neutral">Raucher</HiPill>}
                      {t.notes?.toLowerCase().includes("familie") && <HiPill tone="neutral">Familie</HiPill>}
                    </div>
                  </td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--hi-line)" }}>
                    <StatusPill status={status} />
                  </td>
                  <td style={{ padding: "10px 14px", color: "var(--hi-muted)", fontSize: 12, borderBottom: "1px solid var(--hi-line)" }}>
                    {t.notes || "—"}
                  </td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--hi-line)" }}>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button onClick={() => setEditing(t)} title="Bearbeiten"
                              style={{ background: "transparent", border: "none", padding: 4, cursor: "pointer", color: "var(--hi-muted-strong)" }}>
                        <HiIcon kind="edit" size={14} />
                      </button>
                      <button onClick={() => deleteTable(t.id)} title="Löschen"
                              style={{ background: "transparent", border: "none", padding: 4, cursor: "pointer", color: "oklch(0.7 0.15 25)" }}>
                        <HiIcon kind="trash" size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} style={{ padding: 28, textAlign: "center", color: "var(--hi-muted)", fontSize: 13 }}>
                  Keine Tische in diesem Bereich. Legen Sie einen an.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {(editing || creating) && (
        <TableDialog
          zones={zones}
          table={editing}
          onClose={() => { setEditing(null); setCreating(false); }}
          onSaved={(t) => {
            setTables((prev) => {
              const idx = prev.findIndex((x) => x.id === t.id);
              if (idx < 0) return [...prev, t].sort((a, b) => a.label.localeCompare(b.label));
              const next = [...prev]; next[idx] = t; return next;
            });
            setEditing(null); setCreating(false);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function StatusPill({ status }: { status: TableStatus }) {
  const m = {
    free: { tone: "success" as const, label: "Frei" },
    reserved: { tone: "accent" as const, label: "Reserviert" },
    seated: { tone: "info" as const, label: "Besetzt" },
    countdown: { tone: "warn" as const, label: "Freigabe" },
  };
  const { tone, label } = m[status];
  return <HiPill tone={tone} dot>{label}</HiPill>;
}

function FilterBtn({ active, children, onClick }: {
  active: boolean; children: React.ReactNode; onClick: () => void;
}) {
  return (
    <button onClick={onClick} style={{
      padding: "6px 12px", borderRadius: 7, border: "1px solid var(--hi-line)",
      background: active ? "var(--hi-surface-raised)" : "transparent",
      color: active ? "var(--hi-ink)" : "var(--hi-muted)",
      fontSize: 12, cursor: "pointer", fontWeight: 500,
    }}>
      {children}
    </button>
  );
}

function TableDialog({
  zones, table, onClose, onSaved,
}: {
  zones: Zone[];
  table: TableRow | null;
  onClose: () => void;
  onSaved: (t: TableRow) => void;
}) {
  const [label, setLabel] = useState(table?.label ?? "");
  const [seats, setSeats] = useState(String(table?.seats ?? 4));
  const [shape, setShape] = useState<"round" | "square">(table?.shape ?? "round");
  const [zoneId, setZoneId] = useState<string>(table?.zone_id ?? zones[0]?.id ?? "");
  const [accessible, setAccessible] = useState(table?.accessible ?? false);
  const [notes, setNotes] = useState(table?.notes ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError(null);
    const body = JSON.stringify({
      label, seats: Number(seats), shape, zone_id: zoneId, accessible, notes: notes || null,
    });
    const res = table
      ? await fetch(`/api/tables/${table.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body })
      : await fetch(`/api/tables`, { method: "POST", headers: { "content-type": "application/json" }, body });
    setLoading(false);
    if (!res.ok) { setError((await res.json()).error ?? "Fehler beim Speichern"); return; }
    onSaved(await res.json());
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 50,
        background: "rgba(0,0,0,0.6)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={save}
        style={{
          width: 480, background: "var(--hi-surface)",
          border: "1px solid var(--hi-line)", borderRadius: 14,
          padding: 22, display: "flex", flexDirection: "column", gap: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, letterSpacing: -0.2 }}>
            {table ? "Tisch bearbeiten" : "Neuen Tisch anlegen"}
          </h2>
          <button type="button" onClick={onClose}
                  style={{ background: "transparent", border: "none", color: "var(--hi-muted)", cursor: "pointer", padding: 4 }}>
            <HiIcon kind="x" size={16} />
          </button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <HiField label="Bezeichnung" value={label} onChange={setLabel} placeholder="T1" />
          <HiField label="Plätze" type="number" value={seats} onChange={setSeats} />
        </div>
        <div>
          <div style={{ fontSize: 10.5, color: "var(--hi-muted)", fontWeight: 500, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>
            Bereich
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {zones.map((z) => (
              <button key={z.id} type="button" onClick={() => setZoneId(z.id)} style={{
                padding: "6px 12px", borderRadius: 8,
                border: "1px solid",
                borderColor: zoneId === z.id ? "var(--hi-accent)" : "var(--hi-line)",
                background: zoneId === z.id ? "color-mix(in oklch, var(--hi-accent) 15%, var(--hi-surface))" : "var(--hi-surface-raised)",
                color: zoneId === z.id ? "var(--hi-accent)" : "var(--hi-ink)",
                fontSize: 12, fontWeight: 500, cursor: "pointer",
              }}>{z.name}</button>
            ))}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10.5, color: "var(--hi-muted)", fontWeight: 500, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>
            Form
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {SHAPES.map((s) => (
              <button key={s.id} type="button" onClick={() => setShape(s.id)} style={{
                padding: "6px 12px", borderRadius: 8,
                border: "1px solid",
                borderColor: shape === s.id ? "var(--hi-accent)" : "var(--hi-line)",
                background: shape === s.id ? "color-mix(in oklch, var(--hi-accent) 15%, var(--hi-surface))" : "var(--hi-surface-raised)",
                color: shape === s.id ? "var(--hi-accent)" : "var(--hi-ink)",
                fontSize: 12, fontWeight: 500, cursor: "pointer",
              }}>{s.label}</button>
            ))}
          </div>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--hi-ink)" }}>
          <input type="checkbox" checked={accessible} onChange={(e) => setAccessible(e.target.checked)}
                 style={{ accentColor: "var(--hi-accent)" }} />
          ♿ Rollstuhlgerecht
        </label>
        <HiField label="Notiz" value={notes} onChange={setNotes} placeholder="z. B. Fensterplatz" />
        {error && (
          <div style={{ fontSize: 12, color: "oklch(0.75 0.14 25)" }}>{error}</div>
        )}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
          <HiBtn kind="outline" size="md" type="button" onClick={onClose}>Abbrechen</HiBtn>
          <HiBtn kind="primary" size="md" type="submit" icon="check" disabled={loading}>
            {loading ? "Speichern…" : "Speichern"}
          </HiBtn>
        </div>
      </form>
    </div>
  );
}
