"use client";
import { HiCard, HiPill, HiIcon } from "@/components/primitives";
import { useRealtimeList } from "@/lib/supabase/realtime";
import type { VoiceEvent } from "@/lib/types";

/**
 * Live-Liste der letzten Voice-KI-Errors/Warnings/Infos.
 *
 * Quelle: voice_events-Tabelle. Initial-Hydrat kommt vom Server, neue Events
 * werden via Postgres-Changes (RLS-gefiltert auf restaurant_id) live nachgereicht.
 *
 * Schreibt sich nicht selbst — Inserts kommen aus /api/mcp und /api/v1/voice/*
 * via lib/voice-events.ts.
 */
export function VoiceEventsLive({
  initial,
  restaurantId,
}: {
  initial: VoiceEvent[];
  restaurantId: string;
}) {
  const [items] = useRealtimeList<VoiceEvent>("voice_events", restaurantId, initial);

  const errorCount = items.filter((e) => e.kind === "error").length;
  const warningCount = items.filter((e) => e.kind === "warning").length;

  return (
    <HiCard style={{ padding: 0 }}>
      <div style={{
        padding: "14px 18px", borderBottom: "1px solid var(--hi-line)",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
      }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--hi-ink)" }}>
            Fehler & Ereignisse
          </div>
          <div style={{ fontSize: 11.5, color: "var(--hi-muted)" }}>
            Live-Log aller Server- und KI-Probleme
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {errorCount > 0 && <HiPill tone="danger" dot>{errorCount} Fehler</HiPill>}
          {warningCount > 0 && <HiPill tone="warn" dot>{warningCount} Warnungen</HiPill>}
          {items.length === 0 && <HiPill tone="success" dot>Alles ruhig</HiPill>}
        </div>
      </div>

      <div style={{ padding: "4px 0", maxHeight: 360, overflowY: "auto" }}>
        {items.length === 0 && (
          <div style={{ padding: "28px 18px", textAlign: "center", color: "var(--hi-muted)", fontSize: 12.5 }}>
            Keine Errors oder Warnungen — Voice-KI laeuft sauber.
          </div>
        )}
        {items.slice(0, 30).map((e) => (
          <EventRow key={e.id} event={e} />
        ))}
      </div>
    </HiCard>
  );
}

function EventRow({ event }: { event: VoiceEvent }) {
  const kindStyle = KIND_STYLES[event.kind] ?? KIND_STYLES.info;
  const sourceLabel = SOURCE_LABELS[event.source] ?? event.source;
  const time = new Date(event.created_at).toLocaleTimeString("de-DE", {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    timeZone: "Europe/Berlin",
  });
  const date = new Date(event.created_at).toLocaleDateString("de-DE", {
    day: "2-digit", month: "2-digit",
    timeZone: "Europe/Berlin",
  });

  return (
    <div style={{
      padding: "10px 18px",
      display: "grid", gridTemplateColumns: "70px 24px 1fr",
      gap: 10, alignItems: "flex-start",
      borderBottom: "1px solid var(--hi-line)",
    }}>
      <div className="mono" style={{ fontSize: 11, color: "var(--hi-muted)", paddingTop: 2, lineHeight: 1.4 }}>
        <div>{time}</div>
        <div style={{ fontSize: 9.5, opacity: 0.7 }}>{date}</div>
      </div>
      <div style={{
        width: 22, height: 22, borderRadius: 6,
        background: kindStyle.bg,
        color: kindStyle.fg,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <HiIcon kind={kindStyle.icon} size={12} />
      </div>
      <div>
        <div style={{ fontSize: 12.5, color: "var(--hi-ink)", lineHeight: 1.4 }}>
          {event.message}
        </div>
        <div style={{ fontSize: 10.5, color: "var(--hi-muted)", marginTop: 3, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <span className="mono" style={{
            padding: "1px 5px", borderRadius: 3,
            background: "var(--hi-surface-raised)", border: "1px solid var(--hi-line)",
          }}>
            {sourceLabel}
          </span>
          {event.tool && (
            <span className="mono" style={{
              padding: "1px 5px", borderRadius: 3,
              background: "var(--hi-surface-raised)", border: "1px solid var(--hi-line)",
              color: "var(--hi-muted-strong)",
            }}>
              {event.tool}
            </span>
          )}
          <span style={{ color: kindStyle.fg, fontWeight: 500 }}>{kindStyle.label}</span>
        </div>
      </div>
    </div>
  );
}

const KIND_STYLES = {
  error: {
    label: "Fehler",
    icon: "x" as const,
    bg: "color-mix(in oklch, oklch(0.65 0.2 25) 18%, transparent)",
    fg: "oklch(0.7 0.18 25)",
  },
  warning: {
    label: "Warnung",
    icon: "bell" as const,
    bg: "color-mix(in oklch, oklch(0.78 0.14 70) 18%, transparent)",
    fg: "oklch(0.78 0.14 70)",
  },
  info: {
    label: "Info",
    icon: "dot" as const,
    bg: "color-mix(in oklch, var(--hi-accent) 18%, transparent)",
    fg: "var(--hi-accent)",
  },
};

const SOURCE_LABELS: Record<string, string> = {
  mcp: "MCP",
  rest: "REST",
  agent: "Agent",
  system: "System",
};
