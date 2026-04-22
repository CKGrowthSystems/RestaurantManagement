"use client";
import React, { useEffect, useState } from "react";
import { HiCard, HiIcon } from "./primitives";
import type { Reservation } from "@/lib/types";

interface TimelineTable {
  id: string;
  label: string;
}

export function Timeline({
  reservations, tables,
}: { reservations: Reservation[]; tables: TimelineTable[] }) {
  const hours = ["17", "18", "19", "20", "21", "22"];
  const baseHour = 17;
  const spanHours = hours.length;

  // Now-Marker soll jede Minute wandern, ohne dass die Seite neu geladen werden muss.
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(iv);
  }, []);

  const rows = tables.slice(0, 8).map((t) => {
    const segs = reservations
      .filter((r) => r.table_id === t.id && r.status !== "Storniert")
      .map((r) => {
        const start = new Date(r.starts_at);
        const h = start.getHours() + start.getMinutes() / 60;
        const startRel = Math.max(0, h - baseHour);
        const endRel = Math.min(spanHours, startRel + r.duration_min / 60);
        return { start: startRel, end: endRel, guest: r.guest_name, src: r.source };
      })
      .filter((s) => s.end > 0 && s.start < spanHours);
    return { id: t.id, label: t.label, segs };
  });

  const nowRel = Math.min(spanHours, Math.max(0, now.getHours() + now.getMinutes() / 60 - baseHour));

  const toneColor = (src: string) =>
    src === "Voice-KI" ? "color-mix(in oklch, var(--hi-accent) 55%, var(--hi-surface))"
      : src === "Telefon" ? "color-mix(in oklch, oklch(0.72 0.12 235) 45%, var(--hi-surface))"
      : "rgba(255,255,255,0.13)";
  const toneBorder = (src: string) =>
    src === "Voice-KI" ? "var(--hi-accent)"
      : src === "Telefon" ? "oklch(0.72 0.12 235)" : "rgba(255,255,255,0.25)";

  return (
    <HiCard style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--hi-line)", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--hi-ink)" }}>Heute · Belegung</div>
          <div style={{ fontSize: 11.5, color: "var(--hi-muted)" }}>
            Service 17:00 – 22:00 · {rows.length} Tische angezeigt
          </div>
        </div>
        <div style={{ display: "flex", gap: 12, fontSize: 11, color: "var(--hi-muted-strong)" }}>
          <Legend tone="accent" label="Voice-KI" />
          <Legend tone="info" label="Telefon" />
          <Legend tone="neutral" label="Web / Walk-in" />
        </div>
      </div>
      <div style={{ padding: "12px 18px 18px", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", marginLeft: 56, marginBottom: 8, position: "relative" }}>
          {hours.map((h, i) => (
            <div key={h} className="mono" style={{
              flex: 1, fontSize: 10.5, color: "var(--hi-muted)", fontWeight: 500,
              borderLeft: i > 0 ? "1px dashed var(--hi-line)" : "1px solid var(--hi-line-strong)",
              paddingLeft: 5,
            }}>{h}:00</div>
          ))}
        </div>
        {rows.map((t) => (
          <div key={t.id} style={{ display: "flex", alignItems: "center", height: 30, position: "relative" }}>
            <div className="mono" style={{ width: 56, fontSize: 11.5, color: "var(--hi-muted-strong)", fontWeight: 500 }}>
              {t.label}
            </div>
            <div style={{ flex: 1, position: "relative", height: 22, background: "rgba(255,255,255,0.02)", borderRadius: 4 }}>
              {hours.map((_, i) => i > 0 && (
                <div key={i} style={{
                  position: "absolute", left: `${(i / spanHours) * 100}%`, top: 0, bottom: 0,
                  width: 1, background: "var(--hi-line)", opacity: 0.6,
                }} />
              ))}
              {t.segs.map((s, i) => (
                <div key={i} style={{
                  position: "absolute",
                  left: `${(s.start / spanHours) * 100}%`,
                  width: `${((s.end - s.start) / spanHours) * 100}%`,
                  top: 2, bottom: 2,
                  background: toneColor(s.src),
                  border: `1px solid ${toneBorder(s.src)}`,
                  borderRadius: 4,
                  display: "flex", alignItems: "center",
                  padding: "0 7px", gap: 5, overflow: "hidden",
                  fontSize: 10.5, fontWeight: 500, color: "var(--hi-ink)", whiteSpace: "nowrap",
                }}>
                  {s.src === "Voice-KI" && <HiIcon kind="voice" size={9} style={{ color: "var(--hi-accent)" }} />}
                  {s.guest}
                </div>
              ))}
              {nowRel > 0 && nowRel < spanHours && (
                <div style={{
                  position: "absolute", left: `${(nowRel / spanHours) * 100}%`, top: -4, bottom: -4,
                  width: 1.5, background: "oklch(0.8 0.16 25)",
                }} />
              )}
            </div>
          </div>
        ))}
        {rows.length === 0 && (
          <div style={{ padding: 16, color: "var(--hi-muted)", fontSize: 13 }}>
            Keine Tische konfiguriert. Legen Sie unter „Tische" welche an.
          </div>
        )}
      </div>
    </HiCard>
  );
}

function Legend({ tone, label }: { tone: "accent" | "info" | "neutral"; label: string }) {
  const colors = {
    accent: { bg: "color-mix(in oklch, var(--hi-accent) 55%, var(--hi-surface))", br: "var(--hi-accent)" },
    info: { bg: "color-mix(in oklch, oklch(0.72 0.12 235) 45%, var(--hi-surface))", br: "oklch(0.72 0.12 235)" },
    neutral: { bg: "rgba(255,255,255,0.13)", br: "rgba(255,255,255,0.25)" },
  }[tone];
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <span style={{ width: 10, height: 10, borderRadius: 3, background: colors.bg, border: `1px solid ${colors.br}` }} />
      {label}
    </span>
  );
}
