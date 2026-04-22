"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { HiBtn, HiIcon, HiPill, HiSource, HiTable, type TableStatus } from "@/components/primitives";
import type { Floor, Reservation, RoomPoint, TableRow, Zone } from "@/lib/types";
import { ZoneManagerModal } from "./zone-manager-modal";

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
  room: {
    width: number; height: number;
    entrance_x: number; entrance_y: number; entrance_w: number; entrance_h: number;
  };
  zones: Record<string, { bbox_x: number; bbox_y: number; bbox_w: number; bbox_h: number; polygon: RoomPoint[] | null }>;
  tables: Record<string, { pos_x: number; pos_y: number; zone_id: string | null; rotation: number }>;
}

type DragMode =
  | { type: "table";               id: string; offsetX: number; offsetY: number }
  | { type: "zone-move";            id: string; offsetX: number; offsetY: number }
  | { type: "zone-resize";          id: string; corner: "nw" | "ne" | "sw" | "se"; startX: number; startY: number; start: { x: number; y: number; w: number; h: number } }
  | { type: "entrance";             offsetX: number; offsetY: number }
  | { type: "room-resize";          startX: number; startY: number; startW: number; startH: number }
  | { type: "zone-polygon-vertex";  zoneId: string; index: number };

/** Snap a coordinate to an 8-px grid in edit mode. */
function snap(n: number): number { return Math.round(n / 8) * 8; }

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
  const [showZoneManager, setShowZoneManager] = useState(false);

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
    zones: Object.fromEntries(floorZones.map((z) => [z.id, { bbox_x: z.bbox_x, bbox_y: z.bbox_y, bbox_w: z.bbox_w, bbox_h: z.bbox_h, polygon: z.polygon ?? null }])),
    tables: Object.fromEntries(floorTables.map((t) => [t.id, { pos_x: t.pos_x, pos_y: t.pos_y, zone_id: t.zone_id, rotation: t.rotation ?? 0 }])),
  });
  const [layout, setLayout] = useState<Layout>(buildLayout);
  // Rebuild layout wenn Server-Daten sich aendern (neue Zonen, Tische, Raumaenderungen)
  // oder wenn der Raum gewechselt wird. Im Edit-Modus NICHT neu bauen, damit die
  // noch nicht gespeicherten Aenderungen des Nutzers nicht verloren gehen.
  useEffect(() => {
    if (editMode) return;
    setLayout(buildLayout());
    setSelected((prev) => (prev && floorTables.some((t) => t.id === prev)) ? prev : (floorTables[0]?.id ?? null));
  }, [activeFloorId, zones, tables, floors, editMode]);
  const [drag, setDrag] = useState<DragMode | null>(null);
  // Live-Uhrzeit: tickt jede Sekunde, sodass der Clock-Indikator,
  // Countdowns und status-basierte Table-Farben (free -> countdown ->
  // reserved) sich aktualisieren ohne manuelles Refreshen.
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(iv);
  }, []);

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
    // canvasRef jetzt = innere Plan-Wrapper mit echten Pixel-Dimensionen.
    // Dadurch sind Zeiger-Koordinaten 1:1 unsere Layout-Koordinaten.
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: Math.round(e.clientX - rect.left),
      y: Math.round(e.clientY - rect.top),
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
            ...cur,
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
        next.zones = { ...next.zones, [drag.id]: { ...cur, bbox_x: Math.max(0, Math.round(x)), bbox_y: Math.max(0, Math.round(y)), bbox_w: Math.round(w), bbox_h: Math.round(h) } };
      } else if (drag.type === "entrance") {
        next.room = { ...next.room, entrance_x: Math.max(0, p.x - drag.offsetX), entrance_y: Math.max(0, p.y - drag.offsetY) };
      } else if (drag.type === "room-resize") {
        const dx = p.x - drag.startX, dy = p.y - drag.startY;
        next.room = { ...next.room, width: Math.max(400, drag.startW + dx), height: Math.max(300, drag.startH + dy) };
      } else if (drag.type === "zone-polygon-vertex") {
        const cur = next.zones[drag.zoneId];
        if (!cur || !cur.polygon) return prev;
        // p ist in absoluten Raum-Pixelkoordinaten — Polygon-Punkte liegen
        // RELATIV zur Zone (Koordinate = 0..bbox_w/h). Wir begrenzen sie
        // NICHT auf die bbox, sondern lassen sie ueber die bbox hinauswachsen,
        // und die bbox waechst automatisch mit.
        const relX = snap(p.x - cur.bbox_x);
        const relY = snap(p.y - cur.bbox_y);
        const poly = cur.polygon.slice();
        poly[drag.index] = { x: relX, y: relY };
        // Normalise: wenn Punkt ins Minus faellt, Polygon + bbox shiften
        const minX = Math.min(...poly.map((pt) => pt.x));
        const minY = Math.min(...poly.map((pt) => pt.y));
        let bx = cur.bbox_x, by = cur.bbox_y;
        let shifted = poly;
        if (minX < 0 || minY < 0) {
          const dx = Math.min(0, minX);
          const dy = Math.min(0, minY);
          shifted = poly.map((pt) => ({ x: pt.x - dx, y: pt.y - dy }));
          bx = cur.bbox_x + dx;
          by = cur.bbox_y + dy;
        }
        // bbox_w/h auf groesste Ausdehnung erweitern
        const maxX = Math.max(...shifted.map((pt) => pt.x));
        const maxY = Math.max(...shifted.map((pt) => pt.y));
        const nextZone = {
          ...cur,
          bbox_x: Math.max(0, bx),
          bbox_y: Math.max(0, by),
          bbox_w: Math.max(60, maxX),
          bbox_h: Math.max(60, maxY),
          polygon: shifted,
        };
        next.zones = { ...next.zones, [drag.zoneId]: nextZone };
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
        room: {
          width: layout.room.width,
          height: layout.room.height,
          entrance_x: layout.room.entrance_x,
          entrance_y: layout.room.entrance_y,
          entrance_w: layout.room.entrance_w,
          entrance_h: layout.room.entrance_h,
        },
        zones: Object.entries(layout.zones).map(([id, z]) => ({ id, ...z })),
        tables: Object.entries(layout.tables).map(([id, t]) => ({ id, ...t })),
      }),
    });
    setSaving(false); setEditMode(false);
    router.refresh();
  }
  function cancel() { setLayout(buildLayout()); setEditMode(false); }

  function setTableRotation(id: string, delta: number) {
    setLayout((prev) => {
      const cur = prev.tables[id]; if (!cur) return prev;
      const next = { ...cur, rotation: ((cur.rotation + delta) % 360 + 360) % 360 };
      return { ...prev, tables: { ...prev.tables, [id]: next } };
    });
  }

  // ---- Zone-Polygon ----
  function initZonePolygonFromRect(zoneId: string) {
    setLayout((prev) => {
      const cur = prev.zones[zoneId]; if (!cur) return prev;
      const poly: RoomPoint[] = [
        { x: 0, y: 0 },
        { x: cur.bbox_w, y: 0 },
        { x: cur.bbox_w, y: cur.bbox_h },
        { x: 0, y: cur.bbox_h },
      ];
      return { ...prev, zones: { ...prev.zones, [zoneId]: { ...cur, polygon: poly } } };
    });
  }
  function clearZonePolygon(zoneId: string) {
    setLayout((prev) => {
      const cur = prev.zones[zoneId]; if (!cur) return prev;
      return { ...prev, zones: { ...prev.zones, [zoneId]: { ...cur, polygon: null } } };
    });
  }
  function insertZonePolygonVertex(zoneId: string, afterIndex: number) {
    setLayout((prev) => {
      const cur = prev.zones[zoneId]; if (!cur || !cur.polygon) return prev;
      const a = cur.polygon[afterIndex];
      const b = cur.polygon[(afterIndex + 1) % cur.polygon.length];
      const mid = { x: snap((a.x + b.x) / 2), y: snap((a.y + b.y) / 2) };
      const nextPoly = [...cur.polygon];
      nextPoly.splice(afterIndex + 1, 0, mid);
      return { ...prev, zones: { ...prev.zones, [zoneId]: { ...cur, polygon: nextPoly } } };
    });
  }
  function removeZonePolygonVertex(zoneId: string, index: number) {
    setLayout((prev) => {
      const cur = prev.zones[zoneId]; if (!cur || !cur.polygon || cur.polygon.length <= 3) return prev;
      const nextPoly = cur.polygon.filter((_, i) => i !== index);
      return { ...prev, zones: { ...prev.zones, [zoneId]: { ...cur, polygon: nextPoly } } };
    });
  }

  async function addZone() {
    if (!activeFloorId) return;
    const name = prompt("Name des Bereichs, z. B. Terrasse, Fenster, Bar:");
    if (!name) return;
    // Default-Position: oben links im aktuellen Raum, freie Stelle suchen
    const existing = Object.values(layout.zones);
    const bbox_w = 240;
    const bbox_h = 200;
    const offset = existing.length * 24;
    const res = await fetch("/api/zones", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        floor_id: activeFloorId,
        bbox_x: 40 + offset,
        bbox_y: 80 + offset,
        bbox_w,
        bbox_h,
      }),
    });
    if (!res.ok) {
      alert((await res.json().catch(() => ({}))).error ?? "Bereich konnte nicht angelegt werden");
      return;
    }
    router.refresh();
  }

  async function renameZone(zoneId: string, currentName: string) {
    const name = prompt("Neuer Name:", currentName);
    if (!name || name === currentName) return;
    const res = await fetch(`/api/zones/${zoneId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) { alert((await res.json().catch(() => ({}))).error ?? "Umbenennen fehlgeschlagen"); return; }
    router.refresh();
  }

  async function deleteZone(zoneId: string, zoneName: string) {
    const tablesInZone = floorTables.filter((t) => t.zone_id === zoneId).length;
    const msg = tablesInZone > 0
      ? `Bereich „${zoneName}" löschen? ${tablesInZone} Tisch${tablesInZone === 1 ? "" : "e"} in diesem Bereich werden zonenlos (bleiben erhalten).`
      : `Bereich „${zoneName}" wirklich löschen?`;
    if (!confirm(msg)) return;
    const res = await fetch(`/api/zones/${zoneId}`, { method: "DELETE" });
    if (!res.ok) { alert((await res.json().catch(() => ({}))).error ?? "Löschen fehlgeschlagen"); return; }
    router.refresh();
  }

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
            <HiBtn kind="ghost" size="sm" icon="floor" onClick={() => setShowZoneManager(true)}>
              Bereiche verwalten
            </HiBtn>
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
            {now.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" })}
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

      {/* Edit-Toolbar: horizontale Fixleiste oberhalb des Canvas,
          damit sie keine Zonen oder Tische im oberen linken Bereich verdeckt */}
      {editMode && (
        <div style={{
          padding: "10px 28px",
          borderBottom: "1px solid var(--hi-line)",
          background: "color-mix(in oklch, var(--hi-accent) 10%, var(--hi-surface))",
          display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
          fontSize: 11.5, color: "var(--hi-ink)",
        }}>
          <span style={{ fontWeight: 600, color: "var(--hi-ink)" }}>Plan bearbeiten</span>
          <span className="mono" style={{
            padding: "2px 7px", borderRadius: 5,
            background: "color-mix(in oklch, var(--hi-accent) 15%, var(--hi-surface-raised))",
            color: "var(--hi-accent)", fontSize: 11, fontWeight: 500,
          }}>
            {width}×{height}px
          </span>
          <span style={{ width: 1, height: 18, background: "var(--hi-line)" }} />
          <button
            onClick={() => setLayout((p) => ({ ...p, room: { ...p.room, width: Math.max(400, p.room.width - 100) } }))}
            style={miniBtnStyle} title="Raum schmaler"
          >Breite −100</button>
          <button
            onClick={() => setLayout((p) => ({ ...p, room: { ...p.room, width: p.room.width + 100 } }))}
            style={miniBtnStyle} title="Raum breiter"
          >Breite +100</button>
          <button
            onClick={() => setLayout((p) => ({ ...p, room: { ...p.room, height: Math.max(300, p.room.height - 100) } }))}
            style={miniBtnStyle} title="Raum niedriger"
          >Höhe −100</button>
          <button
            onClick={() => setLayout((p) => ({ ...p, room: { ...p.room, height: p.room.height + 100 } }))}
            style={miniBtnStyle} title="Raum höher"
          >Höhe +100</button>
          <span style={{ width: 1, height: 18, background: "var(--hi-line)" }} />
          <button onClick={addZone} style={{ ...miniBtnStyle, background: "var(--hi-accent)", color: "var(--hi-on-accent)", borderColor: "var(--hi-accent)", fontWeight: 600 }}>
            <HiIcon kind="plus" size={11} /> Bereich anlegen
          </button>
          <button onClick={() => setShowZoneManager(true)} style={miniBtnStyle}>
            <HiIcon kind="floor" size={11} /> Bereiche verwalten ({zones.length})
          </button>
          <span style={{ flex: 1 }} />
          <span style={{ color: "var(--hi-muted-strong)", fontSize: 10.5, lineHeight: 1.4, maxWidth: 440, textAlign: "right" }}>
            Tische, Bereiche, Eingang ziehen · Eckpunkte skalieren · ⬠ an Zone = Polygon-Modus (Punkte ziehen, „+" einfügen, Doppelklick entfernen)
          </span>
        </div>
      )}

      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {/* Panel-Container: relativ, nicht scrollbar — enthaelt Scroll-Child + fixe Overlays */}
        <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
          {/* Scroll-Container: faellt in den Panel-Container, scrollt bei grossem Raum */}
          <div
            style={{
              position: "absolute", inset: 0,
              overflow: "auto",
              background:
                "radial-gradient(circle at 30% 40%, rgba(168,115,47,0.04), transparent 60%)," +
                "repeating-linear-gradient(0deg, transparent, transparent 39px, rgba(255,255,255,0.025) 39px, rgba(255,255,255,0.025) 40px)," +
                "repeating-linear-gradient(90deg, transparent, transparent 39px, rgba(255,255,255,0.025) 39px, rgba(255,255,255,0.025) 40px)," +
                "var(--hi-bg)",
              touchAction: "none",
              cursor: drag ? "grabbing" : "default",
              padding: 40,
            }}
          >
          {!activeFloor ? (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--hi-muted)" }}>
              Kein Raum ausgewählt.
            </div>
          ) : (
            <div
              ref={canvasRef}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={onPointerUp}
              style={{
                position: "relative",
                width, height,
                margin: "0 auto",
                boxShadow: editMode ? "0 0 0 1px color-mix(in oklch, var(--hi-accent) 30%, transparent)" : "none",
              }}
            >
            <svg
              width={width} height={height}
              style={{ display: "block", position: "absolute", top: 0, left: 0 }}
            >
              {/* Raum immer als Rechteck */}
              <rect
                x={0.5} y={0.5} width={width - 1} height={height - 1} rx={10}
                fill="none" stroke="var(--hi-line)" strokeWidth="1.2"
                strokeDasharray={editMode ? "4 3" : "0"}
              />
              {floorZones.map((z) => {
                const L = layout.zones[z.id]; if (!L) return null;
                const hasPoly = L.polygon && L.polygon.length >= 3;
                return (
                  <g key={z.id}>
                    {hasPoly ? (
                      <polygon
                        points={L.polygon!.map((pt) => `${L.bbox_x + pt.x},${L.bbox_y + pt.y}`).join(" ")}
                        fill="rgba(255,255,255,0.015)"
                        stroke={editMode ? "var(--hi-accent)" : "var(--hi-line)"}
                        strokeWidth={editMode ? 1.6 : 1.2}
                        strokeLinejoin="round"
                        style={{ cursor: editMode ? "grab" : "default" }}
                        onPointerDown={(e) => {
                          if (!editMode) return;
                          e.stopPropagation();
                          (e.target as Element).setPointerCapture?.(e.pointerId);
                          const p = canvasPoint(e);
                          setDrag({ type: "zone-move", id: z.id, offsetX: p.x - L.bbox_x, offsetY: p.y - L.bbox_y });
                        }}
                      />
                    ) : (
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
                    )}
                    {/* Polygon-Vertex-Handles (nur Edit + wenn Polygon vorhanden) */}
                    {editMode && hasPoly && L.polygon!.map((pt, i) => {
                      const nextPt = L.polygon![(i + 1) % L.polygon!.length];
                      const mid = { x: L.bbox_x + (pt.x + nextPt.x) / 2, y: L.bbox_y + (pt.y + nextPt.y) / 2 };
                      return (
                        <g key={`zp-${z.id}-${i}`}>
                          <circle
                            cx={mid.x} cy={mid.y} r={5}
                            fill="color-mix(in oklch, var(--hi-accent) 55%, transparent)"
                            stroke="var(--hi-bg)" strokeWidth={1.5}
                            style={{ cursor: "copy", opacity: 0.7 }}
                            onClick={(e) => { e.stopPropagation(); insertZonePolygonVertex(z.id, i); }}
                          />
                          <rect
                            x={L.bbox_x + pt.x - 5} y={L.bbox_y + pt.y - 5} width={10} height={10} rx={2}
                            fill="var(--hi-accent)" stroke="var(--hi-bg)" strokeWidth="1.5"
                            style={{ cursor: "grab" }}
                            onPointerDown={(e) => {
                              e.stopPropagation();
                              (e.target as Element).setPointerCapture?.(e.pointerId);
                              setDrag({ type: "zone-polygon-vertex", zoneId: z.id, index: i });
                            }}
                            onDoubleClick={(e) => { e.stopPropagation(); removeZonePolygonVertex(z.id, i); }}
                          />
                        </g>
                      );
                    })}
                    <text x={L.bbox_x + 10} y={L.bbox_y - 8} fontSize="11"
                          fontFamily="Geist Mono, monospace" fontWeight="500"
                          fill="var(--hi-muted)" letterSpacing="1">
                      {z.name.toUpperCase()}
                    </text>
                    {editMode && (
                      <>
                        {/* Polygon-Toggle */}
                        <g
                          style={{ cursor: "pointer" }}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (hasPoly) clearZonePolygon(z.id);
                            else initZonePolygonFromRect(z.id);
                          }}
                          onPointerDown={(e) => e.stopPropagation()}
                        >
                          <rect
                            x={L.bbox_x + L.bbox_w - 68} y={L.bbox_y - 18}
                            width={18} height={14} rx={3}
                            fill={hasPoly ? "color-mix(in oklch, var(--hi-accent) 28%, var(--hi-surface-raised))" : "var(--hi-surface-raised)"}
                            stroke={hasPoly ? "var(--hi-accent)" : "var(--hi-line)"} strokeWidth="1"
                          />
                          <text
                            x={L.bbox_x + L.bbox_w - 59} y={L.bbox_y - 8}
                            fontSize="9"
                            fill={hasPoly ? "var(--hi-accent)" : "var(--hi-muted-strong)"}
                            textAnchor="middle" fontWeight="600"
                          >⬠</text>
                        </g>
                        {/* Rename-Icon */}
                        <g
                          style={{ cursor: "pointer" }}
                          onClick={(e) => { e.stopPropagation(); renameZone(z.id, z.name); }}
                          onPointerDown={(e) => e.stopPropagation()}
                        >
                          <rect
                            x={L.bbox_x + L.bbox_w - 46} y={L.bbox_y - 18}
                            width={18} height={14} rx={3}
                            fill="var(--hi-surface-raised)" stroke="var(--hi-line)" strokeWidth="1"
                          />
                          <text
                            x={L.bbox_x + L.bbox_w - 37} y={L.bbox_y - 8}
                            fontSize="9" fill="var(--hi-muted-strong)" textAnchor="middle"
                          >✎</text>
                        </g>
                        {/* Delete-Icon */}
                        <g
                          style={{ cursor: "pointer" }}
                          onClick={(e) => { e.stopPropagation(); deleteZone(z.id, z.name); }}
                          onPointerDown={(e) => e.stopPropagation()}
                        >
                          <rect
                            x={L.bbox_x + L.bbox_w - 24} y={L.bbox_y - 18}
                            width={18} height={14} rx={3}
                            fill="color-mix(in oklch, oklch(0.66 0.2 25) 15%, var(--hi-surface-raised))"
                            stroke="color-mix(in oklch, oklch(0.66 0.2 25) 40%, var(--hi-line))" strokeWidth="1"
                          />
                          <text
                            x={L.bbox_x + L.bbox_w - 15} y={L.bbox_y - 8}
                            fontSize="9" fill="oklch(0.75 0.18 25)" textAnchor="middle" fontWeight="600"
                          >×</text>
                        </g>
                      </>
                    )}
                    {/* Rechteck-Resize-Handles nur wenn KEIN Polygon aktiv ist */}
                    {editMode && !hasPoly && (["nw","ne","sw","se"] as const).map((corner) => {
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
            {/* Tisch-Overlay — absolut in Pixel-Koordinaten innerhalb des Plans */}
            {floorTables.map((t) => {
              const local = layout.tables[t.id] ?? { pos_x: t.pos_x, pos_y: t.pos_y, zone_id: t.zone_id, rotation: t.rotation ?? 0 };
              const zoneLayout = local.zone_id ? layout.zones[local.zone_id] : null;
              const absX = zoneLayout ? zoneLayout.bbox_x + local.pos_x : local.pos_x;
              const absY = zoneLayout ? zoneLayout.bbox_y + local.pos_y : local.pos_y;
              const unitSize = 46;
              const { status, countdown } = tableStatus[t.id];
              return (
                <div key={t.id} style={{
                  position: "absolute",
                  left: absX - unitSize / 2,
                  top: absY - unitSize / 2,
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
                      rotation={local.rotation ?? 0}
                      highlight={selected === t.id}
                      onClick={() => setSelected(t.id)}
                    />
                  </div>
                </div>
              );
            })}
            </div>
          )}
          </div>{/* /scroll-container */}

          {/* Rotation panel for selected table in edit mode */}
          {editMode && selectedTable && (
            <div style={{
              position: "absolute", bottom: 14, left: "50%", transform: "translateX(-50%)", zIndex: 5,
              padding: "8px 12px", borderRadius: 10,
              background: "var(--hi-surface)",
              border: "1px solid var(--hi-line)",
              boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
              display: "flex", alignItems: "center", gap: 8,
              fontSize: 12, color: "var(--hi-ink)",
            }}>
              <span className="mono" style={{ fontSize: 11, color: "var(--hi-muted)" }}>
                {selectedTable.label}
              </span>
              <span style={{ width: 1, height: 18, background: "var(--hi-line)" }} />
              <span style={{ fontSize: 11, color: "var(--hi-muted)" }}>Rotation</span>
              <button onClick={() => setTableRotation(selectedTable.id, -15)} style={miniBtnStyle}>−15°</button>
              <button onClick={() => setTableRotation(selectedTable.id, -90)} style={miniBtnStyle}>↺ 90°</button>
              <span className="mono" style={{ minWidth: 40, textAlign: "center", fontSize: 12, fontWeight: 600, color: "var(--hi-accent)" }}>
                {Math.round(layout.tables[selectedTable.id]?.rotation ?? 0)}°
              </span>
              <button onClick={() => setTableRotation(selectedTable.id, 90)} style={miniBtnStyle}>↻ 90°</button>
              <button onClick={() => setTableRotation(selectedTable.id, 15)} style={miniBtnStyle}>+15°</button>
              <button onClick={() => setLayout((p) => ({ ...p, tables: { ...p.tables, [selectedTable.id]: { ...p.tables[selectedTable.id], rotation: 0 } } }))}
                      style={{ ...miniBtnStyle, color: "var(--hi-muted)" }}>
                Reset
              </button>
            </div>
          )}
        </div>{/* /panel-container */}

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
                          {start.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" })} – {end.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" })}
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
      {showZoneManager && (
        <ZoneManagerModal
          floors={floors}
          zones={zones}
          tables={tables}
          onClose={() => setShowZoneManager(false)}
          onChanged={() => router.refresh()}
        />
      )}
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

const miniBtnStyle: React.CSSProperties = {
  padding: "4px 9px", borderRadius: 6, fontSize: 11, fontWeight: 500,
  border: "1px solid var(--hi-line)",
  background: "var(--hi-surface-raised)",
  color: "var(--hi-muted-strong)",
  cursor: "pointer",
  display: "inline-flex", alignItems: "center", gap: 4,
};
