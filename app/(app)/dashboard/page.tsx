import { redirect } from "next/navigation";
import Link from "next/link";
import { getTenantContext } from "@/lib/tenant";
import { Topbar, VoiceBanner } from "@/components/shell";
import { HiBtn, HiCard, HiIcon, HiPill, HiSource } from "@/components/primitives";
import { Sparkline } from "@/components/charts";
import { Timeline } from "@/components/timeline";
import type { Reservation, Zone } from "@/lib/types";
import { ConfirmVoiceForm } from "./confirm-voice";

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}
function minsUntil(iso: string) {
  return Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 60_000));
}

export default async function DashboardPage() {
  const ctx = await getTenantContext();
  if (!ctx) redirect("/login");
  const { supabase, restaurantId, displayName } = ctx;

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart); todayEnd.setDate(todayEnd.getDate() + 1);

  const [
    { data: tables },
    { data: zones },
    { data: reservations },
    { data: voiceCalls },
    { count: todayGuestCount },
    { count: voiceCallsToday },
  ] = await Promise.all([
    supabase.from("tables").select("*").eq("restaurant_id", restaurantId),
    supabase.from("zones").select("*").eq("restaurant_id", restaurantId).order("sort_order"),
    supabase.from("reservations").select("*")
      .eq("restaurant_id", restaurantId)
      .gte("starts_at", todayStart.toISOString())
      .lt("starts_at", todayEnd.toISOString())
      .order("starts_at"),
    supabase.from("voice_calls").select("*")
      .eq("restaurant_id", restaurantId)
      .gte("started_at", todayStart.toISOString())
      .order("started_at", { ascending: false }),
    supabase.from("reservations").select("party_size", { count: "exact", head: true })
      .eq("restaurant_id", restaurantId)
      .gte("starts_at", todayStart.toISOString())
      .lt("starts_at", todayEnd.toISOString()),
    supabase.from("voice_calls").select("*", { count: "exact", head: true })
      .eq("restaurant_id", restaurantId)
      .gte("started_at", todayStart.toISOString()),
  ]);

  const zoneList = (zones ?? []) as Zone[];
  const tableList = (tables ?? []) as { id: string; seats: number; zone_id: string | null }[];
  const allReservations = (reservations ?? []) as Reservation[];
  const pendingVoice = allReservations.filter((r) => r.status === "Offen" && r.source === "Voice-KI");

  const guestsToday = allReservations
    .filter((r) => r.status !== "Storniert" && r.status !== "No-Show")
    .reduce((s, r) => s + r.party_size, 0);
  const capacity = tableList.reduce((s, t) => s + t.seats, 0);
  const occupancyPct = capacity > 0 ? Math.round((guestsToday / capacity) * 100) : 0;

  const zoneStatus = zoneList.map((z) => {
    const zoneTables = tableList.filter((t) => t.zone_id === z.id);
    const total = zoneTables.length;
    const now = Date.now();
    const busyIds = new Set(
      allReservations
        .filter((r) => {
          const start = new Date(r.starts_at).getTime();
          const end = start + r.duration_min * 60_000;
          return start <= now && now <= end && r.status !== "Storniert";
        })
        .map((r) => r.table_id)
        .filter(Boolean) as string[],
    );
    const busy = zoneTables.filter((t) => busyIds.has(t.id)).length;
    const occ = total > 0 ? Math.round((busy / total) * 100) : 0;
    return { name: z.name, total, free: total - busy, occ };
  });

  const upcoming = allReservations
    .filter((r) => new Date(r.starts_at).getTime() >= Date.now() - 5 * 60_000)
    .slice(0, 5);

  const now = new Date();
  const greet = now.getHours() < 11 ? "Guten Morgen" : now.getHours() < 17 ? "Guten Tag" : "Guten Abend";
  const weekday = now.toLocaleDateString("de-DE", { weekday: "long" });
  const dateLabel = now.toLocaleDateString("de-DE", { day: "numeric", month: "long" });

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>
      <Topbar
        title={`${greet}, ${displayName.split(" ")[0]}`}
        subtitle={`${weekday}, ${dateLabel} · ${allReservations.length} Reservierungen heute`}
        right={
          <Link href="/reservations/new">
            <HiBtn kind="primary" size="md" icon="plus">Neue Reservierung</HiBtn>
          </Link>
        }
      />

      {pendingVoice[0] && <ConfirmVoiceForm reservation={pendingVoice[0]} />}

      <div style={{ padding: "20px 28px", display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
          <Kpi label="Gäste heute" value={String(guestsToday)} foot={`/ ${capacity} Kap.`}
               sparkline={<Sparkline data={[30, 42, 38, 55, 62, 70, guestsToday || 1]} />} />
          <Kpi label="Reservierungen" value={String(allReservations.length)}
               foot={`${pendingVoice.length} offen`}
               sparkline={<Sparkline data={[20, 28, 22, 30, 33, 35, allReservations.length || 1]} color="oklch(0.72 0.12 235)" />} />
          <Kpi label="Voice-KI Calls" value={String(voiceCallsToday ?? 0)} foot="heute"
               sparkline={<Sparkline data={[2, 5, 3, 8, 10, 12, voiceCallsToday ?? 1]} color="var(--hi-accent)" />} />
          <Kpi label="Auslastung" value={`${occupancyPct}%`} foot={`Spitze ${occupancyPct >= 85 ? "jetzt" : "21:00"}`}
               sparkline={<Sparkline data={[45, 52, 60, 68, 70, 66, Math.max(1, occupancyPct)]} color="oklch(0.75 0.14 70)" />} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 18 }}>
          <Timeline reservations={allReservations} tables={tableList as any} />
          <HiCard style={{ padding: 0, display: "flex", flexDirection: "column" }}>
            <div style={{
              padding: "14px 18px", borderBottom: "1px solid var(--hi-line)",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--hi-ink)" }}>Nächste Ankünfte</div>
                <div style={{ fontSize: 11.5, color: "var(--hi-muted)" }}>Nächste 90 Min.</div>
              </div>
              <Link href="/reservations"><HiBtn kind="ghost" size="sm">Alle</HiBtn></Link>
            </div>
            <div style={{ padding: "8px 10px", display: "flex", flexDirection: "column" }}>
              {upcoming.length === 0 && (
                <div style={{ padding: 20, color: "var(--hi-muted)", fontSize: 13 }}>
                  Keine anstehenden Reservierungen. Leg eine neue an.
                </div>
              )}
              {upcoming.map((r, i) => {
                const table = tableList.find((t) => t.id === r.table_id);
                return (
                  <div key={r.id} style={{
                    padding: "10px 10px",
                    display: "grid", gridTemplateColumns: "58px 1fr auto",
                    gap: 10, alignItems: "center",
                    borderBottom: i < upcoming.length - 1 ? "1px solid var(--hi-line)" : "none",
                  }}>
                    <div>
                      <div className="mono" style={{ fontSize: 14, fontWeight: 600, color: "var(--hi-ink)", letterSpacing: -0.3 }}>
                        {fmtTime(r.starts_at)}
                      </div>
                      <div style={{ fontSize: 10, color: "var(--hi-muted)" }}>in {minsUntil(r.starts_at)}m</div>
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--hi-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {r.guest_name}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--hi-muted)", display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                        <span>{r.party_size}P</span>·<span>{(table as any)?.label ?? "—"}</span>·<HiSource src={r.source} />
                      </div>
                    </div>
                    {r.status === "Offen" ? (
                      <HiPill tone="accent" dot>Bestätigen</HiPill>
                    ) : (
                      <HiIcon kind="check" size={15} style={{ color: "oklch(0.75 0.13 145)" }} />
                    )}
                  </div>
                );
              })}
            </div>
          </HiCard>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
          <HiCard style={{ padding: 0 }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--hi-line)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--hi-ink)" }}>Status nach Bereich</div>
              <HiPill tone="neutral" dot>Live</HiPill>
            </div>
            <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
              {zoneStatus.map((z) => (
                <div key={z.name}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                    <span style={{ fontSize: 12.5, color: "var(--hi-ink)", fontWeight: 500 }}>{z.name}</span>
                    <span style={{ fontSize: 11, color: "var(--hi-muted)" }}>
                      <span className="mono" style={{ color: "var(--hi-ink)" }}>{z.occ}%</span> · {z.free}/{z.total} frei
                    </span>
                  </div>
                  <div style={{ height: 6, background: "rgba(255,255,255,0.05)", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{
                      width: `${z.occ}%`, height: "100%",
                      background: z.occ > 75 ? "oklch(0.72 0.15 70)" : "var(--hi-accent)",
                      borderRadius: 3,
                    }} />
                  </div>
                </div>
              ))}
            </div>
          </HiCard>

          <HiCard style={{ padding: 0 }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--hi-line)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--hi-ink)" }}>Aktivität</div>
              <HiBtn kind="ghost" size="sm">Log</HiBtn>
            </div>
            <div style={{ padding: "4px 0" }}>
              {(voiceCalls ?? []).slice(0, 4).map((c) => (
                <div key={c.id} style={{
                  padding: "10px 18px",
                  display: "grid", gridTemplateColumns: "40px 24px 1fr",
                  gap: 10, alignItems: "flex-start",
                }}>
                  <span className="mono" style={{ fontSize: 11, color: "var(--hi-muted)", paddingTop: 2 }}>
                    {fmtTime(c.started_at)}
                  </span>
                  <div style={{
                    width: 22, height: 22, borderRadius: 6,
                    background: "color-mix(in oklch, var(--hi-accent) 18%, transparent)",
                    color: "var(--hi-accent)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <HiIcon kind="voice" size={12} />
                  </div>
                  <div>
                    <div style={{ fontSize: 12.5, color: "var(--hi-ink)" }}>
                      {c.outcome === "reservation" ? "Voice-KI hat Reservierung angelegt"
                        : c.outcome === "info" ? "Info-Anfrage beantwortet"
                        : c.outcome === "declined" ? "Anruf abgebrochen" : "Fehler bei Anruf"}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--hi-muted)", marginTop: 1 }}>
                      {c.phone ?? "—"} · {c.duration_sec}s
                    </div>
                  </div>
                </div>
              ))}
              {(!voiceCalls || voiceCalls.length === 0) && (
                <div style={{ padding: 20, color: "var(--hi-muted)", fontSize: 13 }}>
                  Noch keine Voice-KI Aktivität heute.
                </div>
              )}
            </div>
          </HiCard>
        </div>
      </div>
    </div>
  );
}

function Kpi({
  label, value, foot, sparkline,
}: { label: string; value: string; foot?: string; sparkline?: React.ReactNode }) {
  return (
    <HiCard style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
      <span style={{ fontSize: 11, color: "var(--hi-muted)", fontWeight: 500, textTransform: "uppercase", letterSpacing: 0.8 }}>
        {label}
      </span>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span className="mono" style={{ fontSize: 28, fontWeight: 600, letterSpacing: -0.8, color: "var(--hi-ink)" }}>
          {value}
        </span>
        {foot && <span style={{ fontSize: 12, color: "var(--hi-muted)" }}>{foot}</span>}
      </div>
      {sparkline}
    </HiCard>
  );
}
