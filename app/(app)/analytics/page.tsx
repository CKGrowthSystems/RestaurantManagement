import { redirect } from "next/navigation";
import { getTenantContext } from "@/lib/tenant";
import { Topbar } from "@/components/shell";
import { HiBtn, HiCard, HiPill } from "@/components/primitives";
import type { Reservation } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const ctx = await getTenantContext();
  if (!ctx) redirect("/login");
  const { supabase, restaurantId } = ctx;

  const weekStart = new Date(); weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - 6);

  const [{ data: reservations }, { count: noShows }, { data: tables }] = await Promise.all([
    supabase.from("reservations").select("*")
      .eq("restaurant_id", restaurantId)
      .gte("starts_at", weekStart.toISOString())
      .order("starts_at"),
    supabase.from("reservations").select("*", { count: "exact", head: true })
      .eq("restaurant_id", restaurantId)
      .eq("status", "No-Show")
      .gte("starts_at", weekStart.toISOString()),
    supabase.from("tables").select("seats").eq("restaurant_id", restaurantId),
  ]);

  const rs = (reservations ?? []) as Reservation[];
  const totalGuests = rs.filter((r) => r.status !== "Storniert").reduce((s, r) => s + r.party_size, 0);
  const capacity = (tables ?? []).reduce((s, t) => s + t.seats, 0);

  const dayLabels = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
  const days: number[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart); d.setDate(d.getDate() + i);
    const end = new Date(d); end.setDate(end.getDate() + 1);
    return rs
      .filter((r) => {
        const t = new Date(r.starts_at);
        return t >= d && t < end && r.status !== "Storniert";
      })
      .reduce((s, r) => s + r.party_size, 0);
  });
  const maxDay = Math.max(1, ...days);

  // Alte Werte (Telefon, Web, Walk-in) auf die neuen Labels normalisieren,
  // damit historische Daten in die neuen Kategorien fallen.
  const srcLabel = (s: string): string => {
    if (s === "Voice-KI" || s === "Voice") return "Voice-KI";
    if (s === "Telefon" || s === "Chatagent" || s === "Webseite") return "Webseite";
    return "Manuell"; // Web, Walk-in, Walk-In, Manuell, Sonstiges
  };
  const sourceCounts: Record<string, number> = { "Voice-KI": 0, "Webseite": 0, "Manuell": 0 };
  rs.forEach((r) => {
    const key = srcLabel(r.source);
    sourceCounts[key] = (sourceCounts[key] ?? 0) + 1;
  });
  const sourceTotal = Math.max(1, rs.length);
  const sources = Object.entries(sourceCounts).map(([name, n]) => ({
    name,
    value: Math.round((n / sourceTotal) * 100),
    color:
      name === "Voice-KI" ? "var(--hi-accent)" :
      name === "Webseite" ? "oklch(0.72 0.12 235)" :
      "oklch(0.7 0.12 145)", // Manuell
  }));

  const avgOcc = capacity > 0 ? Math.round(((totalGuests / 7) / capacity) * 100) : 0;
  const voiceShare = rs.length ? Math.round((sourceCounts["Voice-KI"] / rs.length) * 100) : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>
      <Topbar
        title="Analytics"
        subtitle={`Diese Woche · ${weekStart.toLocaleDateString("de-DE")} – ${new Date().toLocaleDateString("de-DE")}`}
        right={
          <div style={{ display: "flex", gap: 8 }}>
            <HiBtn kind="outline" size="md">Diese Woche</HiBtn>
            <HiBtn kind="ghost" size="md" icon="export">Export CSV</HiBtn>
          </div>
        }
      />
      <div style={{ flex: 1, overflowY: "auto", padding: "22px 28px", display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          <Kpi k="Gäste gesamt" v={String(totalGuests)} d="diese Woche" tone="success" />
          <Kpi k="Ø Auslastung" v={`${avgOcc}%`} d="pro Tag" tone="success" />
          <Kpi k="No-Shows" v={String(noShows ?? 0)} d={rs.length ? `${Math.round(((noShows ?? 0) / rs.length) * 100)}%` : "—"} tone="warn" />
          <Kpi k="Voice-KI Anteil" v={`${voiceShare}%`} d="aller Quellen" tone="accent" />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 14 }}>
          <HiCard style={{ padding: 0 }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--hi-line)" }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--hi-ink)" }}>Gäste pro Tag</div>
              <div style={{ fontSize: 11.5, color: "var(--hi-muted)" }}>
                Spitze: {dayLabels[days.indexOf(maxDay)]} mit {maxDay} Gästen
              </div>
            </div>
            <div style={{ padding: "16px 18px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
              {/* Balken-Zone: fixe Hoehe, Balken nutzen Prozent davon — koennen
                  nie ueber den Container hinaus ragen. Value-Label sitzt
                  innerhalb der Zone direkt ueber dem Balken. */}
              <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 160 }}>
                {days.map((v, i) => {
                  const peak = v === maxDay;
                  // 88% damit ueber dem Balken Platz fuer den Value-Text bleibt
                  const pct = maxDay > 0 ? (v / maxDay) * 88 : 0;
                  return (
                    <div key={i} style={{
                      flex: 1, display: "flex", flexDirection: "column",
                      alignItems: "center", justifyContent: "flex-end",
                      height: "100%", gap: 4, minWidth: 0,
                    }}>
                      <span className="mono" style={{
                        fontSize: 11, color: peak ? "var(--hi-accent)" : "var(--hi-muted-strong)",
                        fontWeight: peak ? 600 : 500,
                      }}>{v}</span>
                      <div style={{
                        width: "100%", maxWidth: 50,
                        height: `${pct}%`, minHeight: v > 0 ? 4 : 2,
                        background: peak
                          ? "linear-gradient(180deg, var(--hi-accent), color-mix(in oklch, var(--hi-accent) 50%, transparent))"
                          : "linear-gradient(180deg, color-mix(in oklch, var(--hi-ink) 20%, transparent), color-mix(in oklch, var(--hi-ink) 6%, transparent))",
                        border: `1px solid ${peak ? "var(--hi-accent)" : "var(--hi-line)"}`,
                        borderRadius: "6px 6px 0 0",
                      }} />
                    </div>
                  );
                })}
              </div>
              {/* Wochentag-Labels in eigener Reihe — ergeben so eine saubere
                  Trennung zwischen Datenflaeche und Achsenbeschriftung. */}
              <div style={{ display: "flex", gap: 10 }}>
                {dayLabels.map((label, i) => {
                  const peak = days[i] === maxDay;
                  return (
                    <div key={i} style={{
                      flex: 1, textAlign: "center",
                      fontSize: 11,
                      color: peak ? "var(--hi-accent)" : "var(--hi-muted)",
                      fontWeight: peak ? 600 : 500,
                    }}>
                      {label}
                    </div>
                  );
                })}
              </div>
            </div>
          </HiCard>

          <HiCard style={{ padding: 0 }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--hi-line)" }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--hi-ink)" }}>Reservierungsquellen</div>
              <div style={{ fontSize: 11.5, color: "var(--hi-muted)" }}>Verteilung der Woche</div>
            </div>
            <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", height: 10, borderRadius: 5, overflow: "hidden" }}>
                {sources.map((s) => (
                  <div key={s.name} style={{ width: `${s.value}%`, background: s.color }} />
                ))}
              </div>
              {sources.map((s) => (
                <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 5, background: s.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 12.5, color: "var(--hi-ink)", flex: 1 }}>{s.name}</span>
                  <span className="mono" style={{ fontSize: 12, color: "var(--hi-muted-strong)" }}>{s.value}%</span>
                </div>
              ))}
            </div>
          </HiCard>
        </div>
      </div>
    </div>
  );
}

function Kpi({ k, v, d, tone }: { k: string; v: string; d: string; tone: "success" | "warn" | "accent" }) {
  return (
    <HiCard style={{ padding: "14px 16px" }}>
      <div style={{ fontSize: 10.5, color: "var(--hi-muted)", textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 500 }}>{k}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 6 }}>
        <span className="mono" style={{ fontSize: 26, fontWeight: 600, color: "var(--hi-ink)", letterSpacing: -0.5 }}>{v}</span>
        <HiPill tone={tone} style={{ padding: "1px 6px", fontSize: 10 }}>{d}</HiPill>
      </div>
    </HiCard>
  );
}
