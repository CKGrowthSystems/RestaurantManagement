"use client";
import { useEffect, useState } from "react";
import { HiIcon } from "@/components/primitives";
import type { Reservation, TableRow } from "@/lib/types";

interface Props {
  reservation: Reservation;
  tables: Pick<TableRow, "id" | "label">[];
  onClose: () => void;
  onSaved: (next: Reservation) => void;
  onDeleted: (id: string) => void;
}

/** Local YYYY-MM-DDTHH:MM for a Date (Berlin). */
function toLocalDateTimeValue(iso: string): string {
  const d = new Date(iso);
  // Extract Berlin-local wall-clock via Intl to avoid UTC drift on server boot.
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(d);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}`;
}

/** Reverse: convert datetime-local "YYYY-MM-DDTHH:MM" (Berlin) back to ISO UTC. */
function fromLocalDateTimeValue(v: string): string {
  // v is in browser-local TZ semantics, but datetime-local inputs have no tz.
  // We interpret it as Berlin time by appending an offset.
  // Probe offset for that moment (handles DST).
  const probe = new Date(v + "Z"); // treat as UTC to get a reference instant
  const offMin = berlinOffsetMinutes(probe);
  const sign = offMin >= 0 ? "+" : "-";
  const abs = Math.abs(offMin);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return new Date(`${v}:00${sign}${hh}:${mm}`).toISOString();
}

function berlinOffsetMinutes(d: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(d);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const berlinMinutes = h * 60 + m;
  const utcMinutes = d.getUTCHours() * 60 + d.getUTCMinutes();
  let diff = berlinMinutes - utcMinutes;
  if (diff < -720) diff += 1440;
  if (diff > 720) diff -= 1440;
  return diff;
}

export function ReservationEditModal({ reservation, tables, onClose, onSaved, onDeleted }: Props) {
  const [form, setForm] = useState({
    guest_name: reservation.guest_name,
    phone: reservation.phone ?? "",
    email: reservation.email ?? "",
    party_size: reservation.party_size,
    starts_at: toLocalDateTimeValue(reservation.starts_at),
    duration_min: reservation.duration_min,
    note: reservation.note ?? "",
    table_id: reservation.table_id ?? "",
    status: reservation.status,
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function save() {
    setSaving(true); setError(null);
    try {
      const payload = {
        guest_name: form.guest_name,
        phone: form.phone || null,
        email: form.email || null,
        party_size: Number(form.party_size),
        starts_at: fromLocalDateTimeValue(form.starts_at),
        duration_min: Number(form.duration_min),
        note: form.note || null,
        table_id: form.table_id || null,
        status: form.status,
      };
      const res = await fetch(`/api/reservations/${reservation.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`);
      const updated = await res.json();
      onSaved(updated as Reservation);
      onClose();
    } catch (err: any) {
      setError(err?.message ?? "Speichern fehlgeschlagen");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm(`Reservierung „${reservation.guest_name}" wirklich stornieren?`)) return;
    setDeleting(true); setError(null);
    try {
      const res = await fetch(`/api/reservations/${reservation.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "Storniert" }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onDeleted(reservation.id);
      onClose();
    } catch (err: any) {
      setError(err?.message ?? "Stornieren fehlgeschlagen");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 560,
          background: "var(--hi-surface)",
          border: "1px solid var(--hi-line)",
          borderRadius: 12,
          overflow: "hidden",
          display: "flex", flexDirection: "column",
          maxHeight: "90vh",
        }}
      >
        <div style={{
          padding: "16px 22px", borderBottom: "1px solid var(--hi-line)",
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: "color-mix(in oklch, var(--hi-accent) 18%, var(--hi-surface))",
            color: "var(--hi-accent)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <HiIcon kind="edit" size={15} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--hi-ink)" }}>Reservierung bearbeiten</div>
            <div style={{ fontSize: 11.5, color: "var(--hi-muted)" }}>
              {reservation.guest_name} · {reservation.party_size} P · {new Date(reservation.starts_at).toLocaleString("de-DE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
            </div>
          </div>
          <button onClick={onClose} style={{
            width: 30, height: 30, borderRadius: 7,
            background: "transparent", border: "1px solid var(--hi-line)",
            color: "var(--hi-muted)", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <HiIcon kind="x" size={13} />
          </button>
        </div>

        <div style={{ padding: 22, overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
          {error && (
            <div style={{
              padding: "8px 12px", borderRadius: 7, fontSize: 12,
              background: "color-mix(in oklch, oklch(0.66 0.2 25) 15%, transparent)",
              color: "oklch(0.8 0.15 25)",
              border: "1px solid color-mix(in oklch, oklch(0.66 0.2 25) 40%, var(--hi-line))",
            }}>
              {error}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Gast-Name">
              <input type="text" value={form.guest_name}
                     onChange={(e) => setForm({ ...form, guest_name: e.target.value })}
                     style={inputStyle}/>
            </Field>
            <Field label="Personen">
              <input type="number" min={1} max={40} value={form.party_size}
                     onChange={(e) => setForm({ ...form, party_size: Number(e.target.value) })}
                     style={inputStyle}/>
            </Field>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Telefon">
              <input type="tel" value={form.phone}
                     onChange={(e) => setForm({ ...form, phone: e.target.value })}
                     style={inputStyle}/>
            </Field>
            <Field label="E-Mail">
              <input type="email" value={form.email}
                     onChange={(e) => setForm({ ...form, email: e.target.value })}
                     style={inputStyle}/>
            </Field>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
            <Field label="Datum & Uhrzeit">
              <input type="datetime-local" value={form.starts_at}
                     onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
                     style={inputStyle}/>
            </Field>
            <Field label="Dauer (Min.)">
              <input type="number" min={30} max={360} step={15} value={form.duration_min}
                     onChange={(e) => setForm({ ...form, duration_min: Number(e.target.value) })}
                     style={inputStyle}/>
            </Field>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Tisch">
              <select value={form.table_id}
                      onChange={(e) => setForm({ ...form, table_id: e.target.value })}
                      style={inputStyle}>
                <option value="">— kein Tisch —</option>
                {tables.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Status">
              <select value={form.status}
                      onChange={(e) => setForm({ ...form, status: e.target.value as any })}
                      style={inputStyle}>
                <option value="Offen">Offen</option>
                <option value="Bestätigt">Bestätigt</option>
                <option value="Eingetroffen">Eingetroffen</option>
                <option value="Abgeschlossen">Abgeschlossen</option>
                <option value="No-Show">No-Show</option>
                <option value="Storniert">Storniert</option>
              </select>
            </Field>
          </div>

          <Field label="Notiz">
            <textarea value={form.note}
                      onChange={(e) => setForm({ ...form, note: e.target.value })}
                      rows={3}
                      style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}/>
          </Field>
        </div>

        <div style={{
          padding: "14px 22px", borderTop: "1px solid var(--hi-line)",
          display: "flex", gap: 10, alignItems: "center",
          background: "var(--hi-bg)",
        }}>
          <button onClick={remove} disabled={deleting || saving}
                  style={{
                    padding: "8px 14px", borderRadius: 7, fontSize: 12.5, fontWeight: 500,
                    border: "1px solid color-mix(in oklch, oklch(0.66 0.2 25) 40%, var(--hi-line))",
                    background: "transparent", color: "oklch(0.75 0.18 25)",
                    cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
                  }}>
            <HiIcon kind="trash" size={12} /> {deleting ? "Stornieren…" : "Stornieren"}
          </button>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} disabled={saving || deleting}
                  style={{
                    padding: "8px 14px", borderRadius: 7, fontSize: 12.5, fontWeight: 500,
                    border: "1px solid var(--hi-line)", background: "transparent",
                    color: "var(--hi-muted-strong)", cursor: "pointer",
                  }}>
            Abbrechen
          </button>
          <button onClick={save} disabled={saving || deleting}
                  style={{
                    padding: "8px 14px", borderRadius: 7, fontSize: 12.5, fontWeight: 600,
                    border: "1px solid var(--hi-accent)",
                    background: "var(--hi-accent)", color: "var(--hi-on-accent)",
                    cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
                  }}>
            <HiIcon kind="check" size={12} /> {saving ? "Speichern…" : "Änderungen speichern"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 11, fontWeight: 500, color: "var(--hi-muted)", letterSpacing: 0.3 }}>{label}</span>
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  background: "var(--hi-surface-raised)",
  border: "1px solid var(--hi-line)",
  borderRadius: 6,
  padding: "7px 10px",
  fontSize: 12.5,
  color: "var(--hi-ink)",
  outline: "none",
  width: "100%",
  fontFamily: "inherit",
};
