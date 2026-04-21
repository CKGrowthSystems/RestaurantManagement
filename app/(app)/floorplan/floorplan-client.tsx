"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { HiBtn, HiIcon, HiPill, HiSource, HiTable, type TableStatus } from "@/components/primitives";
import type { Floor, Reservation, TableRow, Zone } from "@/lib/types";

function statusForTable(tableId: string, rs: Reservation[], now: Date): { status: TableStatus; countdown: string | null } {
  const nowMs = now.getTime();
  const active = rs.find((r) => r.table_id === tableId && r.status !== "Storniert" && r.status !== "No-Show");
  if (!active) return { status: "free", countdown: null };
  const start = new Date(active.starts_at).getTime();
  const end = start + active.duration_min * 60_000;
  if (active.status === "Eingetroffen") return { status: "seated", countdown: null };
  if (active.status === "Abgeschlossen") return { status: "free", countdown: null };
  if (nowMs < start) return { status: "reserved", countdown: null };
  if (nowMs >= start && nowMs < start + 20 * 60_000) {
    const left = Math.max(0, start + 20 * 60_000 - nowMs);
    const mm = Math.floor(left / 60_000), ss = Math.floor((left % 60_000) / 1000);
    return { status: "countdown", countdown: `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}` };
  }
  if (nowMs < end) return { status: "reserved", countdown: null };
  return { status: "free", countdown: null };
}

interface Layout {
  room: { width: number; height: number; entrance_x: number; entrance_y: number; entrance_w: number; entrance_h: number };
  zones: Record<string, { bbox_x: number; bbox_y: number; bbox_w: number; bbox_h: number }>;
  tables: Record<string, { pos_x: number; pos_y: number; zone_id: string | null }>;
}

type DragMode =
  | { type: "table";         id: string; offsetX: number; offsetY: number }
  | { type: "zone-move";     id: string; offsetX: number; offsetY: number }
  | { type: "zone-resize";   id: string; corner: "nw" | "ne" | "sw" | "se"; startX: number; startY: number; start: { x: number; y: number; w: number; h: number } }
  | { type: "entrance";      offsetX: number; offsetY: number }
  | { type: "room-resize";   startX: number; startY: number; startW: number; startH: number };

export function FloorplanClient({
  floors: initialFloors, tables, zones, reservations,
}: { floors: Floor[]; tables: TableRow[]; zones: Zone[]; reservations: Reservation[] }) {
  const router = useRouter();
  const canvasRef = useRef<HTMLDivElement>(null);

  const [floors, setFloors] = useState(initialFloors);
  const [activeFloorId, setActiveFloorId] = useState<string | null>(initialFloors[0]?.id ?? null);
  useEffect(() => {
    if (!activeFloorId && floors[0]) setActiveFloorId(floors[0].id);
    if (activeFloorId && !floors.some((f) => f.id === activeFloorId) && floors[0]) setActiveFloorId(floors[0].id);
  }, [floors, activeFloorId]);

  const activeFloor = floors.find((f) => f.id === activeFloorId) ?? null;
  const floorZones = zones.filter((z) => z.floor_id === activeFloorId);
  const floorZoneIds = new Set(floorZones.map((z) => z.id));
  const floorTables = tables.filter((t) => t.zone_id && floorZoneIds.has(t.zone_id));

  const [editMode, setEditMode] = useState(false);
  const [selected, setSelected] = useState<string | null>(floorTables[0]?.id ?? null);
  const [saving, setSaving] = useState(false);

  // Per-floor layout state; rebuilt when floor changes
  const buildLayout = (): Layout => ({
    room: {
      width: activeFloor?.room_width ?? 940,
      height: activeFloor?.room_height ?? 480,
      entrance_x: activeFloor?.entrance_x ?? 600,
      entrance_y: activeFloor?.entrance_y ?? 440,
      entrance_w: activeFloor?.entrance_w ?? 60,
      entrance_h: activeFloor?.entrance_h ?? 20,
    },
    zones: Object.fromEntries(floorZones.map((z) => [z.id, { bbox_x: z.bbox_x, bbox_y: z.bbox_y, bbox_w: z.bbox_w, bbox_h: z.bbox_h }])),
    tables: Object.fromEntries(floorTables.map((t) => [t.id, { pos_x: t.pos_x, pos_y: t.pos_y, zone_id: t.zone_id }])),
  });
  const [layout, setLayout] = useState<Layout>(buildLayout);
  useEffect(() => { setLayout(buildLayout()); setSelected(floorTables[0]?.id ?? null); }, [activeFloorId]);
  const [drag, setDrag] = useState<DragMode | null>(null);
  const now = new Date();

  const tableStatus = useMemo(() => {
    const map: Record<string, { status: TableStatus; countdown: string | null }> = {};
    floorTables.forEach((t) => (map[t.id] = editMode ? { status: "free", countdown: null } : statusForTable(t.id, reservations, now)));
    return map;
  }, [floorTables, reservations, now, editMode]);

  const counts = { free: 0, seated: 0, reserved: 0, countdown: 0 };
  Object.values(tableStatus).forEach((s) => (counts[s.status] += 1));

  const selectedTable = floorTables.find((t) => t.id === selected) ?? null;
  const selectedZone = selectedTable ? floorZones.find((z) => z.id === selectedTable.zone_id) : null;
  const selectedReservations = selectedTable
    ? reservations.filter((r) => r.table_id === selectedTable.id).sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    : [];

  function canvasPoint(e: React.PointerEvent | React.MouseEvent): { x: number; y: number } {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: Math.round((e.clientX - rect.left) * (layout.room.width / rect.width)),
      y: Math.round((e.clientY - rect.top)  * (layout.room.height / rect.height)),
    };
  }
  function zoneAt(x: number, y: number): string | null {
    for (const z of floorZones) {
      const L = layout.zones[z.id];
      if (!L) continue;
      if (x >= L.bbox_x && x <= L.bbox_x + L.bbox_w && y >= L.bbox_y && y <= L.bbox_y + L.bbox_h) return z.id;
    }
    return null;
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag || !editMode) return;
    e.preventDefault();
    const p = canvasPoint(e);
    setLayout((prev) => {
      const next = { ...prev };
      if (drag.type === "table") {
        const cur = next.tables[drag.id];
        if (!cur) return prev;
        const tableX = p.x - drag.offsetX;
        const tableY = p.y - drag.offsetY;
        const zoneId = zoneAt(tableX, tableY) ?? cur.zone_id;
        const zone = zoneId ? layout.zones[zoneId] : null;
        next.tables = {
          ...next.tables,
          [drag.id]: {
            zone_id: zoneId,
            pos_x: zone ? Math.max(20, Math.min(zone.bbox_w - 20, tableX - zone.bbox_x)) : tableX,
            pos_y: zone ? Math.max(20, Math.min(zone.bbox_h - 20, tableY - zone.bbox_y)) : tableY,
          },
        };
      } else if (drag.type === "zone-move") {
        const cur = next.zones[drag.id];
        if (!cur) return prev;
        next.zones = { ...next.zones, [drag.id]: { ...cur, bbox_x: Math.max(0, p.x - drag.offsetX), bbox_y: Math.max(0, p.y - drag.offsetY) } };
      } else if (drag.type === "zone-resize") {
        const cur = next.zones[drag.id];
        if (!cur) return prev;
        let { x, y, w, h } = drag.start;
        const dx = p.x - drag.startX, dy = p.y - drag.startY;
        if (drag.corner === "se") { w = Math.max(80, drag.start.w + dx); h = Math.max(80, drag.start.h + dy); }
        if (drag.corner === "ne") { w = Math.max(80, drag.start.w + dx); y = drag.start.y + dy; h = Math.max(80, drag.start.h - dy); }
        if (drag.corner === "sw") { x = drag.start.x + dx; w = Math.max(80, drag.start.w - dx); h = Math.max(80, drag.start.h + dy); }
        if (drag.corner === "nw") { x = drag.start.x + dx; y = drag.start.y + dy; w = Math.max(80, drag.start.w - dx); h = Math.max(80, drag.start.h - dy); }
        next.zones = { ...next.zones, [drag.id]: { bbox_x: Math.max(0, Math.round(x)), bbox_y: Math.max(0, Math.round(y)), bbox_w: Math.round(w), bbox_h: Math.round(h) } };
      } else if (drag.type === "entrance") {
        next.room = { ...next.room, entrance_x: Math.max(0, p.x - drag.offsetX), entrance_y: Math.max(0, p.y - drag.offsetY) };
      } else if (drag.type === "room-resize") {
        const dx = p.x - drag.startX, dy = p.y - drag.startY;
        next.room = { ...next.room, width: Math.max(400, drag.startW + dx), height: Math.max(300, drag.startH + dy) };
      }
      return next;
    });
  }
  function onPointerUp() { setDrag(null); }

  async function save() {
    if (!activeFloorId) return;
    setSaving(true);
    await fetch("/api/floorplan", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        floor_id: activeFloorId,
        room: layout.room,
        zones: Object.entries(layout.zones).map(([id, z]) => ({ id, ...z })),
        tables: Object.entries(layout.tables).map(([id, t]) => ({ id, ...t })),
      }),
    });
    setSaving(false); setEditMode(false);
    router.refresh();
  }
  function cancel() { setLayout(buildLayout()); setEditMode(false); }

  async function addFloor() {
    const name = prompt("Name des neuen Raums, z. B. Obergeschoss:");
    if (!name) return;
    const res = await fetch("/api/floors", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      alert((await res.json()).error ?? "Raum konnte nicht angelegt werden");
      return;
    }
    const created = (await res.json()) as Floor;
    setFloors((prev) => [...prev, created]);
    setActiveFloorId(created.id);
    router.refresh();
  }
  async function deleteActiveFloor() {
    if (!activeFloor) return;
    if (floors.length <= 1) { alert("Mindestens ein Raum muss bestehen bleiben."); return; }
    if (!confirm(`Raum „${activeFloor.name}" mit allen Zonen und Tischen löschen?`)) return;
    const res = await fetch(`/api/floors/${activeFloor.id}`, { method: "DELETE" });
    if (!res.ok) { alert((await res.json()).error ?? "Löschen fehlgeschlagen"); return; }
    setFloors((prev) => prev.filter((f) => f.id !== activeFloor.id));
    const next = floors.find((f) => f.id !== activeFloor.id);
    if (next) setActiveFloorId(next.id);
    router.refresh();
  }
  async function renameActiveFloor() {
    if (!activeFloor) return;
    const name = prompt("Neuer Name:", activeFloor.name);
    if (!name || name === activeFloor.name) return;
    await fetch(`/api/floors/${activeFloor.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setFloors((prev) => prev.map((f) => f.id === activeFloor.id ? { ...f, name } : f));
    router.refresh();
  }

  const { width, height } = layout.room;

  return (
    <>
      <div style={{
        display: "flex", alignItems: "center", gap: 6,
        padding: "10px 28px 0", borderBottom: "1px solid var(--hi-line)",
        overflowX: "auto", flexWrap: "nowrap",
      }}>
        {floors.map((f) => {
          const isActive = f.id === activeFloorId;
          return (
            <button key={f.id} onClick={() => setActiveFloorId(f.id)} style={{
              padding: "9px 16px", borderRadius: "8px 8px 0 0",
              border: "1px solid var(--hi-line)",
              borderBottom: isActive ? "1px solid var(--hi-bg)" : "1px solid var(--hi-line)",
              marginBottom: -1,
              background: isActive ? "var(--hi-bg)" : "var(--hi-surface)",
              color: isActive ? "var(--hi-ink)" : "var(--hi-muted-strong)",
              fontSize: 12.5, fontWeight: 500, cursor: "pointer",
              whiteSpace: "nowrap",
            }}>
              {f.name}
            </button>
          );
        })}
        <button onClick={addFloor} title="Neuen Raum anlegen" style={{
          padding: "8px 12px", borderRadius: 8,
          border: "1px dashed var(--hi-line)",
          background: "transparent", color: "var(--hi-muted-strong)",
          fontSize: 12.5, cursor: "pointer", marginLeft: 6,
          display: "inline-flex", alignItems: "center", gap: 6,
        }}>
          <HiIcon kind="plus" size={13} /> Raum
        </button>
        <div style={{ flex: 1 }} />
        {activeFloor && (
          <div style={{ display: "flex", gap: 4, paddingBottom: 8 }}>
            <HiBtn kind="ghost" size="sm" icon="edit" onClick={renameActiveFloor}>Umbenennen</HiBtn>
            <HiBtn kind="danger" size="sm" icon="trash" onClick={deleteActiveFloor} disabled={floors.length <= 1}>
              Raum löschen
            </HiBtn>
          </div>
        )}
      </div>

      <div style={{
        padding: "14px 28px", display: "flex", alignItems: "center", gap: 12,
        borderBottom: "1px solid var(--hi-line)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: "var(--hi-surface)", border: "1px solid var(--hi-line)", borderRadius: 8 }}>
          <HiIcon kind="clock" size={14} style={{ color: "var(--hi-muted)" }} />
          <span style={{ fontSize: 11, color: "var(--hi-muted)" }}>Zeitpunkt</span>
          <span className="mono" style={{ fontSize: 13, fontWeight: 600, color: "var(--hi-ink)" }}>
            {now.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
          </span>
          <span style={{ width: 1, height: 16, background: "var(--hi-line)" }} />
          <HiPill tone={editMode ? "warn" : "accent"} dot>{editMode ? "Bearbeiten" : "Jetzt"}</HiPill>
        </div>
        <div style={{ flex: 1 }} />
        {!editMode && (
          <div style={{ display: "flex", gap: 14, fontSize: 11, color: "var(--hi-muted-strong)", alignItems: "center" }}>
            <Swatch color="var(--hi-surface-raised)" border="var(--hi-line-strong)" label={`Frei (${counts.free})`} />
            <Swatch color="color-mix(in oklch, var(--hi-accent) 18%, var(--hi-surface))" border="var(--hi-accent)" label={`Reserviert (${counts.reserved})`} />
            <Swatch color="color-mix(in oklch, oklch(0.7 0.12 145) 18%, var(--hi-surface))" border="oklch(0.68 0.13 145)" label={`Besetzt (${counts.seated})`} />
            <Swatch color="color-mix(in oklch, oklch(0.75 0.14 70) 20%, var(--hi-surface))" border="oklch(0.72 0.15 70)" label={`Freigabe (${counts.countdown})`} />
          </div>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          {editMode ? (
            <>
              <HiBtn kind="ghost" size="md" onClick={cancel}>Abbrechen</HiBtn>
              <HiBtn kind="primary" size="md" icon="check" onClick={save} disabled={saving}>
                {saving ? "Speichern…" : "Layout speichern"}
              </HiBtn>
            </>
          ) : (
            <HiBtn kind="outline" size="md" icon="edit" onClick={() => setEditMode(true)} disabled={!activeFloor}>
              Plan bearbeiten
            </HiBtn>
          )}
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <div
          ref={canvasRef}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          style={{
            flex: 1, position: "relative",
            background:
              "radial-gradient(circle at 30% 40%, rgba(168,115,47,0.04), transparent 60%)," +
              "repeating-linear-gradient(0deg, transparent, transparent 39px, rgba(255,255,255,0.025) 39px, rgba(255,255,255,0.025) 40px)," +
              "repeating-linear-gradient(90deg, transparent, transparent 39px, rgba(255,255,255,0.025) 39px, rgba(255,255,255,0.025) 40px)," +
              "var(--hi-bg)",
            overflow: "hidden",
            touchAction: "none",
            cursor: drag ? "grabbing" : "default",
          }}
        >
          {!activeFloor ? (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--hi-muted)" }}>
              Kein Raum ausgewählt.
            </div>
          ) : (
            <svg
              width="100%" height="100%"
              viewBox={`0 0 ${width} ${height}`}
              preserveAspectRatio="xMidYMid meet"
              style={{ position: "absolute", inset: 0 }}
            >
              <rect x={0.5} y={0.5} width={width - 1} height={height - 1} rx={10}
                    fill="none" stroke="var(--hi-line)" strokeWidth="1.2" strokeDasharray={editMode ? "4 3" : "0"} />
              {floorZones.map((z) => {
                const L = layout.zones[z.id]; if (!L) return null;
                return (
                  <g key={z.id}>
                    <rect
                      x={L.bbox_x} y={L.bbox_y} width={L.bbox_w} height={L.bbox_h} rx={8}
                      fill="rgba(255,255,255,0.015)"
                      stroke={editMode ? "var(--hi-accent)" : "var(--hi-line)"}
                      strokeWidth={editMode ? 1.6 : 1.2}
                      style={{ cursor: editMode ? "grab" : "default" }}
                      onPointerDown={(e) => {
                        if (!editMode) return;
                        e.stopPropagation();
                        (e.target as Element).setPointerCapture?.(e.pointerId);
                        const p = canvasPoint(e);
                        setDrag({ type: "zone-move", id: z.id, offsetX: p.x - L.bbox_x, offsetY: p.y - L.bbox_y });
                      }}
                    />
                    <text x={L.bbox_x + 10} y={L.bbox_y - 8} fontSize="11"
                          fontFamily="Geist Mono, monospace" fontWeight="500"
                          fill="var(--hi-muted)" letterSpacing="1">
                      {z.name.toUpperCase()}
                    </text>
                    {editMode && (["nw","ne","sw","se"] as const).map((corner) => {
                      const cx = corner.includes("w") ? L.bbox_x : L.bbox_x + L.bbox_w;
                      const cy = corner.includes("n") ? L.bbox_y : L.bbox_y + L.bbox_h;
                      return (
                        <rect key={corner}
                          x={cx - 5} y={cy - 5} width={10} height={10} rx={2}
                          fill="var(--hi-accent)" stroke="var(--hi-bg)" strokeWidth="1.5"
                          style={{ cursor: corner === "nw" || corner === "se" ? "nwse-resize" : "nesw-resize" }}
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            (e.target as Element).setPointerCapture?.(e.pointerId);
                            const p = canvasPoint(e);
                            setDrag({
                              type: "zone-resize", id: z.id, corner,
                              startX: p.x, startY: p.y,
                              start: { x: L.bbox_x, y: L.bbox_y, w: L.bbox_w, h: L.bbox_h },
                            });
                          }}
                        />
                      );
                    })}
                  </g>
                );
              })}
              <g
                style={{ cursor: editMode ? "grab" : "default" }}
                onPointerDown={(e) => {
                  if (!editMode) return;
                  e.stopPropagation();
                  (e.target as Element).setPointerCapture?.(e.pointerId);
                  const p = canvasPoint(e);
                  setDrag({ type: "entrance", offsetX: p.x - layout.room.entrance_x, offsetY: p.y - layout.room.entrance_y });
                }}
              >
                <rect
                  x={layout.room.entrance_x} y={layout.room.entrance_y}
                  width={layout.room.entrance_w} height={layout.room.entrance_h} rx={4}
                  fill={editMode ? "color-mix(in oklch, var(--hi-accent) 20%, transparent)" : "rgba(168,115,47,0.1)"}
                  stroke={editMode ? "var(--hi-accent)" : "rgba(168,115,47,0.4)"}
                  strokeWidth="1.2" strokeDasharray="3 2"
                />
                <text
                  x={layout.room.entrance_x + layout.room.entrance_w / 2}
                  y={layout.room.entrance_y + layout.room.entrance_h + 13}
                  fontSize="9" fontFamily="Geist Mono, monospace"
                  fill="var(--hi-muted)" textAnchor="middle"
                >
                  EINGANG
                </text>
              </g>
              {editMode && (
                <rect
                  x={width - 12} y={height - 12} width={14} height={14} rx={2}
                  fill="var(--hi-accent)" stroke="var(--hi-bg)" strokeWidth="1.5"
                  style={{ cursor: "nwse-resize" }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    (e.target as Element).setPointerCapture?.(e.pointerId);
                    const p = canvasPoint(e);
                    setDrag({ type: "room-resize", startX: p.x, startY: p.y, startW: width, startH: height });
                  }}
                />
              )}
            </svg>
          )}

          <div style={{ position: "absolute", inset: 0 }}>
            {activeFloor && floorTables.map((t) => {
              const local = layout.tables[t.id] ?? { pos_x: t.pos_x, pos_y: t.pos_y, zone_id: t.zone_id };
              const zoneLayout = local.zone_id ? layout.zones[local.zone_id] : null;
              const absX = zoneLayout ? zoneLayout.bbox_x + local.pos_x : local.pos_x;
              const absY = zoneLayout ? zoneLayout.bbox_y + local.pos_y : local.pos_y;
              const unitSize = 46;
              const { status, countdown } = tableStatus[t.id];
              return (
                <div key={t.id} style={{
                  position: "absolute",
                  left: `calc(${(absX / width) * 100}% - ${unitSize / 2}px)`,
                  top: `calc(${(absY / height) * 100}% - ${unitSize / 2}px)`,
                  touchAction: "none",
                }}>
                  <div
                    onPointerDown={(e) => {
                      if (!editMode) return;
                      e.stopPropagation();
                      (e.target as Element).setPointerCapture?.(e.pointerId);
                      setDrag({ type: "table", id: t.id, offsetX: 0, offsetY: 0 });
                    }}
                    style={{ cursor: editMode ? "grab" : "pointer" }}
                  >
                    <HiTable
                      shape={t.shape} seats={t.seats} label={t.label}
                      status={status} size={unitSize} countdown={countdown}
                      highlight={!editMode && selected === t.id}
                      onClick={editMode ? undefined : () => setSelected(t.id)}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {editMode && (
            <div style={{
              position: "absolute", top: 12, left: 12,
              padding: "8px 12px", borderRadius: 8,
              background: "color-mix(in oklch, var(--hi-accent) 15%, var(--hi-surface))",
              border: "1px solid var(--hi-accent)",
              fontSize: 11.5, color: "var(--hi-ink)", maxWidth: 360,
            }}>
              <div style={{ fontWeight: 600, marginBottom: 2 }}>Plan bearbeiten</div>
              <div style={{ color: "var(--hi-muted-strong)" }}>
                Tische, Bereiche und Eingang ziehen · Eckpunkte zum Skalieren · rechts unten = Raumgröße
              </div>
            </div>
          )}
        </div>

        {!editMode && (
          <aside style={{
            width: 340, borderLeft: "1px solid var(--hi-line)",
            background: "var(--hi-surface)",
            display: "flex", flexDirection: "column", overflowY: "auto",
          }}>
            {selectedTable ? (
              <>
                <div style={{ padding: "18px 20px 14px", borderBottom: "1px solid var(--hi-line)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <HiTable shape={selectedTable.shape} seats={selectedTable.seats}
                             label={selectedTable.label}
                             status={tableStatus[selectedTable.id].status}
                             countdown={tableStatus[selectedTable.id].countdown}
                             size={42} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 16, fontWeight: 600, color: "var(--hi-ink)", letterSpacing: -0.2 }}>
                        Tisch {selectedTable.label}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--hi-muted)" }}>
                        {selectedZone?.name ?? "—"} · {selectedTable.seats} Plätze · {selectedTable.shape === "round" ? "rund" : "eckig"}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
                    {selectedTable.accessible && <HiPill tone="neutral">♿ Rollstuhlgerecht</HiPill>}
                    {selectedTable.notes && <HiPill tone="neutral">{selectedTable.notes}</HiPill>}
                  </div>
                </div>
                <div style={{ padding: "16px 20px 4px", fontSize: 10.5, color: "var(--hi-muted)", letterSpacing: 0.8, fontWeight: 600 }}>
                  HEUTIGE RESERVIERUNGEN
                </div>
                <div style={{ padding: "0 12px 16px" }}>
                  {selectedReservations.length === 0 && (
                    <div style={{ padding: "12px 8px", color: "var(--hi-muted)", fontSize: 12 }}>
                      Noch keine Reservierungen heute.
                    </div>
                  )}
                  {selectedReservations.map((r) => {
                    const start = new Date(r.starts_at);
                    const end = new Date(start.getTime() + r.duration_min * 60_000);
                    const active = Date.now() >= start.getTime() && Date.now() <= end.getTime()
                      && r.status !== "Storniert" && r.status !== "Abgeschlossen";
                    return (
                      <div key={r.id} style={{
                        padding: "10px 12px", borderRadius: 8, marginBottom: 4,
                        background: active ? "var(--hi-surface-raised)" : "transparent",
                        border: active ? "1px solid color-mix(in oklch, var(--hi-accent) 40%, var(--hi-line))" : "1px solid transparent",
                        opacity: end.getTime() < Date.now() ? 0.55 : 1,
                      }}>
                        <div className="mono" style={{
                          fontSize: 11.5,
                          color: active ? "var(--hi-accent)" : "var(--hi-muted-strong)",
                          fontWeight: 500, marginBottom: 3,
                        }}>
                          {start.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} – {end.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                          <div style={{ fontSize: 13, fontWeight: 500, color: "var(--hi-ink)" }}>
                            {r.guest_name} <span style={{ color: "var(--hi-muted)", fontWeight: 400 }}>· {r.party_size}P</span>
                          </div>
                          <HiSource src={r.source} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ padding: "0 20px 20px", marginTop: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
                  <a href={`/reservations/new?table=${selectedTable.id}`}>
                    <HiBtn kind="primary" size="md" icon="plus" style={{ width: "100%" }}>
                      Reservierung zuweisen
                    </HiBtn>
                  </a>
                  <a href={`/reservations/new?table=${selectedTable.id}&walkin=1`}>
                    <HiBtn kind="outline" size="md" icon="walkin" style={{ width: "100%" }}>
                      Walk-in hierher setzen
                    </HiBtn>
                  </a>
                </div>
              </>
            ) : (
              <div style={{ padding: 28, color: "var(--hi-muted)", fontSize: 13 }}>
                Tisch auswählen für Details
              </div>
            )}
          </aside>
        )}
      </div>
    </>
  );
}

function Swatch({ color, border, label }: { color: string; border: string; label: string }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <span style={{ width: 12, height: 12, borderRadius: 6, border: `1.4px solid ${border}`, background: color }} />
      {label}
    </span>
  );
}
