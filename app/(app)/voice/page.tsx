import { redirect } from "next/navigation";
import { getTenantContext } from "@/lib/tenant";
import { Topbar } from "@/components/shell";
import { HiBtn, HiCard, HiIcon, HiPill } from "@/components/primitives";
import type { VoiceCall } from "@/lib/types";
import { CopyWebhookUrl } from "./copy-url";

export const dynamic = "force-dynamic";

export default async function VoicePage() {
  const ctx = await getTenantContext();
  if (!ctx) redirect("/login");
  const { supabase, restaurantId } = ctx;

  const [{ data: calls }, { data: restaurantRow }] = await Promise.all([
    supabase.from("voice_calls").select("*")
      .eq("restaurant_id", restaurantId)
      .order("started_at", { ascending: false })
      .limit(20),
    supabase.from("restaurants").select("webhook_secret").eq("id", restaurantId).maybeSingle(),
  ]);

  const callList = (calls ?? []) as VoiceCall[];
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todays = callList.filter((c) => new Date(c.started_at) >= todayStart);
  const converted = todays.filter((c) => c.outcome === "reservation").length;
  const avgDuration = todays.length > 0
    ? Math.round(todays.reduce((s, c) => s + c.duration_sec, 0) / todays.length)
    : 0;
  const failures = todays.filter((c) => c.outcome === "failed").length;

  const endpoints = [
    { method: "POST", path: "/api/v1/voice/availability", desc: "Prüft Tisch-Verfügbarkeit",   count: todays.length * 10 },
    { method: "POST", path: "/api/v1/voice/reservation",  desc: "Legt neue Reservierung an",    count: converted },
    { method: "GET",  path: "/api/v1/voice/hours",        desc: "Aktuelle Öffnungszeiten",      count: Math.max(0, todays.length - converted) },
    { method: "POST", path: "/api/v1/voice/cancel",       desc: "Storniert Reservierung",       count: 0 },
  ];

  const latest = callList[0] ?? null;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>
      <Topbar
        title="Voice-KI Agent"
        subtitle={`GoHighLevel Integration · ${todays.length} Calls heute`}
        right={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <HiPill tone="success" dot>Webhook Live</HiPill>
            <HiBtn kind="outline" size="md" icon="edit">Prompt bearbeiten</HiBtn>
          </div>
        }
      />

      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 420px", gap: 0, minHeight: 0 }}>
        <div style={{ padding: "22px 28px", display: "flex", flexDirection: "column", gap: 18, overflowY: "auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            <Stat label="Calls heute" value={String(todays.length)} sub={`Insg. ${callList.length}`} />
            <Stat label="Ø Dauer" value={fmtDur(avgDuration)} sub="min" />
            <Stat label="Konvertiert" value={todays.length ? `${Math.round((converted / todays.length) * 100)}%` : "—"} sub={`${converted} / ${todays.length}`} />
            <Stat label="Fehler" value={String(failures)} sub="letzte 24h" />
          </div>

          <HiCard style={{ padding: 0 }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--hi-line)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--hi-ink)" }}>Webhook-Endpoints</div>
                <div style={{ fontSize: 11.5, color: "var(--hi-muted)" }}>
                  GoHighLevel ruft diese Endpoints zur Laufzeit auf. Shared-Secret als <code className="mono">X-Webhook-Secret</code>.
                </div>
              </div>
              <CopyWebhookUrl secret={restaurantRow?.webhook_secret ?? ""} />
            </div>
            <div style={{ padding: "8px 18px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
              {endpoints.map((w) => (
                <div key={w.path} style={{
                  padding: "10px 12px", borderRadius: 8,
                  background: "var(--hi-surface-raised)", border: "1px solid var(--hi-line)",
                  display: "grid", gridTemplateColumns: "60px 1fr auto auto", gap: 12, alignItems: "center",
                }}>
                  <span className="mono" style={{
                    fontSize: 10.5, fontWeight: 600,
                    color: w.method === "POST" ? "oklch(0.75 0.13 145)" : "oklch(0.8 0.1 235)",
                    padding: "2px 7px", borderRadius: 4,
                    background: w.method === "POST" ? "rgba(90,170,110,0.12)" : "rgba(120,170,220,0.12)",
                    textAlign: "center",
                  }}>{w.method}</span>
                  <div>
                    <div className="mono" style={{ fontSize: 12.5, color: "var(--hi-ink)" }}>{w.path}</div>
                    <div style={{ fontSize: 11, color: "var(--hi-muted)", marginTop: 2 }}>{w.desc}</div>
                  </div>
                  <span className="mono" style={{ fontSize: 11, color: "var(--hi-muted-strong)" }}>{w.count} calls</span>
                  <HiPill tone="success" dot>Live</HiPill>
                </div>
              ))}
            </div>
          </HiCard>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <HiCard style={{ padding: 0 }}>
              <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--hi-line)" }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--hi-ink)" }}>Event Log</div>
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
        </div>

        <aside style={{ borderLeft: "1px solid var(--hi-line)", background: "var(--hi-surface)", overflowY: "auto" }}>
          <div style={{ padding: "18px 20px 10px" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--hi-ink)" }}>Letzte Calls</div>
            <div style={{ fontSize: 11, color: "var(--hi-muted)" }}>Heute · {todays.length} Gespräche</div>
          </div>
          <div style={{ padding: "0 12px 20px" }}>
            {callList.slice(0, 20).map((c) => (
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
            {callList.length === 0 && (
              <div style={{ padding: 14, color: "var(--hi-muted)", fontSize: 12 }}>
                Noch keine Anrufe. GoHighLevel kann die Endpoints oben live aufrufen.
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <HiCard style={{ padding: "14px 16px" }}>
      <div style={{ fontSize: 10.5, color: "var(--hi-muted)", textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 500 }}>{label}</div>
      <div className="mono" style={{ fontSize: 22, fontWeight: 600, color: "var(--hi-ink)", marginTop: 4, letterSpacing: -0.5 }}>{value}</div>
      <div style={{ fontSize: 11, color: "var(--hi-muted)", marginTop: 2 }}>{sub}</div>
    </HiCard>
  );
}
function fmtDur(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}
