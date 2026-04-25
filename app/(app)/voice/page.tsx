import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getTenantContext } from "@/lib/tenant";
import { Topbar } from "@/components/shell";
import { HiCard, HiPill } from "@/components/primitives";
import type { VoiceCall } from "@/lib/types";
import { CopyWebhookUrl } from "./copy-url";
import { IntegrationWizard } from "./integration-wizard";
import { PasswordGate } from "./password-gate";
import { VoiceCallsLive, VoiceCallsLiveSidebar } from "./voice-calls-live";

export const dynamic = "force-dynamic";

export default async function VoicePage() {
  const ctx = await getTenantContext();
  if (!ctx) redirect("/login");
  const { supabase, restaurantId } = ctx;

  const hdrs = await headers();
  const proto = hdrs.get("x-forwarded-proto") ?? "https";
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "localhost:3030";
  const baseUrl = `${proto}://${host}`;

  const [{ data: calls }, { data: restaurantRow }] = await Promise.all([
    supabase.from("voice_calls").select("*")
      .eq("restaurant_id", restaurantId)
      .order("started_at", { ascending: false })
      .limit(20),
    supabase.from("restaurants").select("webhook_secret, name").eq("id", restaurantId).maybeSingle(),
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
    <PasswordGate>
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>
      <Topbar
        title="Voice-KI Agent"
        subtitle={`GoHighLevel Integration · ${todays.length} Calls heute`}
        right={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <HiPill tone="success" dot>Webhook Live</HiPill>
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

          <IntegrationWizard
            baseUrl={baseUrl}
            secret={restaurantRow?.webhook_secret ?? ""}
            restaurantName={restaurantRow?.name ?? "Rhodos Ohlsbach"}
          />

          <HiCard style={{ padding: 0 }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--hi-line)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--hi-ink)" }}>Aufruf-Statistik</div>
                <div style={{ fontSize: 11.5, color: "var(--hi-muted)" }}>Heutige Nutzung pro Endpoint</div>
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

          <VoiceCallsLive initial={callList} restaurantId={restaurantId} />
        </div>

        <aside style={{ borderLeft: "1px solid var(--hi-line)", background: "var(--hi-surface)", overflowY: "auto" }}>
          <VoiceCallsLiveSidebar initial={callList} restaurantId={restaurantId} />
        </aside>
      </div>
    </div>
    </PasswordGate>
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
