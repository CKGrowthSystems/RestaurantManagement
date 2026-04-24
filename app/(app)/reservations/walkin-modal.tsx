"use client";
import { useState } from "react";
import { HiBtn, HiIcon } from "@/components/primitives";

interface Props {
  zones: { id: string; name: string }[];
  onClose: () => void;
  onPlaced?: () => void;
}

const PARTY_SIZES = [1, 2, 3, 4, 5, 6, 7, 8, 10, 12];

/**
 * Quick Walk-In: Gast sitzt bereits / steht vor dem Restaurant,
 * braucht sofort einen Platz. Nur Personenzahl (+ optional Bereich
 * und Notiz). Kein Name, keine Telefonnummer.
 */
export function WalkInModal({ zones, onClose, onPlaced }: Props) {
  const [party, setParty] = useState(2);
  const [zoneName, setZoneName] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function place() {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/walkin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ party_size: party, zone: zoneName, note: note || null }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      onPlaced?.();
      onClose();
    } catch (err: any) {
      setError(err?.message ?? "Walk-In konnte nicht platziert werden.");
    } finally {
      setLoading(false);
    }
  }

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
          width: "100%", maxWidth: 460,
          background: "var(--hi-surface)",
          border: "1px solid var(--hi-line)",
          borderRadius: 12,
          overflow: "hidden",
          display: "flex", flexDirection: "column",
        }}
      >
        <div style={{
          padding: "16px 22px", borderBottom: "1px solid var(--hi-line)",
          display: "flex", alignItems: "center", gap: 12,
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: 8,
            background: "color-mix(in oklch, oklch(0.72 0.12 145) 18%, var(--hi-surface))",
            color: "oklch(0.78 0.12 145)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <HiIcon kind="plus" size={17} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--hi-ink)" }}>Walk-In platzieren</div>
            <div style={{ fontSize: 11.5, color: "var(--hi-muted)" }}>
              Gast ohne Reservierung — nur Personenzahl. Kein Name nötig.
            </div>
          </div>
          <button onClick={onClose} style={closeBtn}><HiIcon kind="x" size={13} /></button>
        </div>

        <div style={{ padding: 22, display: "flex", flexDirection: "column", gap: 18 }}>
          <div>
            <div style={labelStyle}>Personen</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }}>
              {PARTY_SIZES.map((n) => (
                <button
                  key={n}
                  onClick={() => setParty(n)}
                  style={{
                    padding: "10px 0", borderRadius: 8,
                    border: "1px solid",
                    borderColor: party === n ? "var(--hi-accent)" : "var(--hi-line)",
                    background: party === n
                      ? "color-mix(in oklch, var(--hi-accent) 18%, var(--hi-surface))"
                      : "var(--hi-surface-raised)",
                    color: party === n ? "var(--hi-accent)" : "var(--hi-ink)",
                    fontSize: 14, fontWeight: 600,
                    cursor: "pointer",
                    fontFamily: '"Geist Mono", monospace',
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {zones.length > 0 && (
            <div>
              <div style={labelStyle}>Bereich (optional)</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button
                  onClick={() => setZoneName(null)}
                  style={{
                    ...zoneBtnStyle,
                    ...(zoneName === null ? zoneBtnActiveStyle : {}),
                  }}
                >
                  Egal
                </button>
                {zones.map((z) => (
                  <button
                    key={z.id}
                    onClick={() => setZoneName(z.name)}
                    style={{
                      ...zoneBtnStyle,
                      ...(zoneName === z.name ? zoneBtnActiveStyle : {}),
                    }}
                  >
                    {z.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <div style={labelStyle}>Notiz (optional)</div>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={80}
              placeholder="z. B. Fensterplatz, Kinderstuhl, Allergie"
              style={{
                width: "100%", padding: "9px 11px", borderRadius: 7,
                border: "1px solid var(--hi-line)",
                background: "var(--hi-surface-raised)",
                color: "var(--hi-ink)", fontSize: 13,
                outline: "none", fontFamily: "inherit",
                boxSizing: "border-box",
              }}
            />
          </div>

          {error && (
            <div style={{
              padding: "8px 12px", borderRadius: 7, fontSize: 12,
              background: "color-mix(in oklch, oklch(0.66 0.2 25) 15%, transparent)",
              color: "oklch(0.82 0.14 25)",
              border: "1px solid color-mix(in oklch, oklch(0.66 0.2 25) 40%, var(--hi-line))",
            }}>
              {error}
            </div>
          )}
        </div>

        <div style={{
          padding: "12px 22px", borderTop: "1px solid var(--hi-line)",
          background: "var(--hi-bg)",
          display: "flex", gap: 10, alignItems: "center", justifyContent: "flex-end",
        }}>
          <HiBtn kind="ghost" size="md" onClick={onClose}>Abbrechen</HiBtn>
          <HiBtn kind="primary" size="md" icon="check" onClick={place} disabled={loading}>
            {loading ? "Platziere…" : `${party} P. platzieren`}
          </HiBtn>
        </div>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: 10.5, color: "var(--hi-muted)", fontWeight: 600,
  letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 8,
};
const zoneBtnStyle: React.CSSProperties = {
  padding: "6px 12px", borderRadius: 7, fontSize: 12, fontWeight: 500,
  border: "1px solid var(--hi-line)",
  background: "var(--hi-surface-raised)",
  color: "var(--hi-ink)", cursor: "pointer",
};
const zoneBtnActiveStyle: React.CSSProperties = {
  borderColor: "var(--hi-accent)",
  background: "color-mix(in oklch, var(--hi-accent) 15%, var(--hi-surface))",
  color: "var(--hi-accent)",
};
const closeBtn: React.CSSProperties = {
  width: 30, height: 30, borderRadius: 7,
  background: "transparent", border: "1px solid var(--hi-line)",
  color: "var(--hi-muted)", cursor: "pointer",
  display: "flex", alignItems: "center", justifyContent: "center",
};
