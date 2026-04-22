"use client";
import { HiCard, HiPill } from "@/components/primitives";
import type { VoiceCall } from "@/lib/types";
import { useRealtimeList } from "@/lib/supabase/realtime";

/**
 * Realtime-Voice-Call-Anzeige.
 * Ersetzt drei statische Renderbereiche der Voice-KI-Seite durch eine
 * live-subscribte Variante, die neue Anrufe via Supabase Realtime
 * sofort einbindet. Event Log + Call-Transkript + Rechte Sidebar.
 */
export function VoiceCallsLive({
  initial, restaurantId,
}: { initial: VoiceCall[]; restaurantId: string }) {
  const [calls] = useRealtimeList<VoiceCall>("voice_calls", restaurantId, initial);
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todays = calls.filter((c) => new Date(c.started_at) >= todayStart);
  const latest = calls[0] ?? null;

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <HiCard style={{ padding: 0 }}>
          <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--hi-line)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--hi-ink)" }}>Event Log</div>
            <LivePill />
          </div>
          <div className="mono" style={{ fontSize: 11, padding: "10px 16px 14px" }}>
            {todays.slice(0, 8).map((c) => (
              <div key={c.id} style={{
                padding: "4px 0", display: "grid", gridTemplateColumns: "64px 140px 1fr",
                gap: 10, color: "var(--hi-muted)",
              }}>
                <span>{new Date(c.started_at).toLocaleTimeString("de-DE", { hour12: false })}</span>
                <span style={{ color: c.outcome === "reservation" ? "oklch(0.75 0.13 145)" : c.outcome === "failed" ? "oklch(0.75 0.14 25)" : "var(--hi-muted-strong)", fontWeight: 500 }}>
                  {c.outcome === "reservation" ? "reservation.created" : c.outcome === "info" ? "info.answered" : c.outcome === "declined" ? "call.declined" : "call.failed"}
                </span>
                <span style={{ color: "var(--hi-muted-strong)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {c.phone ?? "—"}
                </span>
              </div>
            ))}
            {todays.length === 0 && (
              <div style={{ color: "var(--hi-muted)", padding: 6 }}>— Noch keine Events heute —</div>
            )}
          </div>
        </HiCard>

        <HiCard style={{ padding: 0 }}>
          <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--hi-line)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: "var(--hi-ink)" }}>
                Call · {latest ? new Date(latest.started_at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) : "—"}
              </span>
              {latest && <HiPill tone="accent">{fmtDur(latest.duration_sec)}</HiPill>}
            </div>
            <div style={{ fontSize: 11.5, color: "var(--hi-muted)" }}>
              {latest?.phone ?? "Noch kein Gespräch"}
            </div>
          </div>
          <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 8, fontSize: 12, lineHeight: 1.5 }}>
            {(latest?.transcript ?? []).slice(0, 10).map((l, i) => (
              <div key={i} style={{ display: "flex", gap: 8 }}>
                <span className="mono" style={{
                  minWidth: 24, height: 20, fontSize: 10, fontWeight: 600,
                  color: l.speaker === "AI" ? "var(--hi-accent)" : "var(--hi-muted-strong)",
                  background: l.speaker === "AI" ? "color-mix(in oklch, var(--hi-accent) 14%, transparent)" : "rgba(255,255,255,0.05)",
                  padding: "2px 6px", borderRadius: 4, textAlign: "center",
                }}>
                  {l.speaker === "AI" ? "KI" : "G"}
                </span>
                <span style={{ color: l.speaker === "AI" ? "var(--hi-ink)" : "var(--hi-muted-strong)" }}>{l.text}</span>
              </div>
            ))}
            {(!latest?.transcript || latest.transcript.length === 0) && (
              <div style={{ color: "var(--hi-muted)" }}>
                Kein Transkript. Die KI sendet den Dialog als Array unter <code className="mono">transcript</code>.
              </div>
            )}
          </div>
        </HiCard>
      </div>
    </>
  );
}

/**
 * Sidebar (rechte Spalte) der Voice-KI-Seite — live.
 */
export function VoiceCallsLiveSidebar({
  initial, restaurantId,
}: { initial: VoiceCall[]; restaurantId: string }) {
  const [calls] = useRealtimeList<VoiceCall>("voice_calls", restaurantId, initial);
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todays = calls.filter((c) => new Date(c.started_at) >= todayStart);
  return (
    <>
      <div style={{ padding: "18px 20px 10px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--hi-ink)" }}>Letzte Calls</div>
          <div style={{ fontSize: 11, color: "var(--hi-muted)" }}>Heute · {todays.length} Gespräche</div>
        </div>
        <LivePill />
      </div>
      <div style={{ padding: "0 12px 20px" }}>
        {calls.slice(0, 20).map((c) => (
          <div key={c.id} style={{
            padding: "10px 10px", borderRadius: 8, marginBottom: 2,
            background: "transparent", border: "1px solid transparent",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
              <span className="mono" style={{ fontSize: 12, color: "var(--hi-muted-strong)", fontWeight: 500 }}>
                {new Date(c.started_at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
              </span>
              <span className="mono" style={{ fontSize: 10.5, color: "var(--hi-muted)" }}>{fmtDur(c.duration_sec)}</span>
            </div>
            <div style={{ fontSize: 12.5, color: "var(--hi-ink)", fontWeight: 500, marginTop: 2 }}>
              {c.phone ?? "Unbekannt"}
            </div>
            <div style={{ display: "flex", alignItems: "center", marginTop: 4 }}>
              <HiPill tone={c.outcome === "reservation" ? "success" : c.outcome === "failed" ? "danger" : "neutral"} dot>
                {c.outcome === "reservation" ? "Reservierung" : c.outcome === "info" ? "Info" : c.outcome === "declined" ? "Abgelehnt" : "Fehler"}
              </HiPill>
            </div>
          </div>
        ))}
        {calls.length === 0 && (
          <div style={{ padding: 14, color: "var(--hi-muted)", fontSize: 12 }}>
            Noch keine Anrufe. GoHighLevel kann die Endpoints oben live aufrufen.
          </div>
        )}
      </div>
    </>
  );
}

function LivePill() {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "2px 8px", borderRadius: 10,
      background: "color-mix(in oklch, oklch(0.72 0.12 145) 12%, transparent)",
      border: "1px solid color-mix(in oklch, oklch(0.72 0.12 145) 35%, var(--hi-line))",
      color: "oklch(0.8 0.12 145)",
      fontSize: 10, fontWeight: 500,
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: 3,
        background: "oklch(0.72 0.12 145)",
        animation: "hi-dot-pulse 1.6s ease-in-out infinite",
      }} />
      Live
    </span>
  );
}

function fmtDur(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}
