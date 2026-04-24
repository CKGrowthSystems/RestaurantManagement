"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { HiBtn, HiCard, HiIcon, HiPill, HiTable, HiField } from "@/components/primitives";
import { rankCandidates } from "@/lib/assignment";
import type { Reservation, TableRow, Zone } from "@/lib/types";

function defaultStart(): { date: string; time: string } {
  const d = new Date();
  d.setMinutes(d.getMinutes() + 120);
  d.setMinutes(Math.round(d.getMinutes() / 15) * 15, 0, 0);
  return {
    date: d.toISOString().slice(0, 10),
    time: `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`,
  };
}

export function NewReservationWizard({
  tables, zones, existing,
}: { tables: TableRow[]; zones: Zone[]; existing: Reservation[] }) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [{ date, time }, setDT] = useState(defaultStart);
  const [duration, setDuration] = useState(90);
  const [party, setParty] = useState(4);
  const [zoneId, setZoneId] = useState<string | null>(null);
  const [tableId, setTableId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [accessible, setAccessible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startsAt = new Date(`${date}T${time}:00`);
  const candidates = useMemo(
    () =>
      rankCandidates({
        tables, zones, existing,
        partySize: party,
        startsAt,
        durationMin: duration,
        preferredZoneName: zoneId ? zones.find((z) => z.id === zoneId)?.name ?? null : null,
        requireAccessible: accessible,
      }).slice(0, 4),
    [tables, zones, existing, party, startsAt, duration, zoneId, accessible],
  );

  const selectedTable = tables.find((t) => t.id === (tableId ?? candidates[0]?.table.id));
  const selectedZone = selectedTable ? zones.find((z) => z.id === selectedTable.zone_id) : null;

  async function submit() {
    if (!name) { setError("Gastname fehlt"); setStep(3); return; }
    setSaving(true); setError(null);
    const body = {
      table_id: tableId ?? candidates[0]?.table.id ?? null,
      guest_name: name,
      phone: phone || null,
      email: email || null,
      party_size: party,
      starts_at: startsAt.toISOString(),
      duration_min: duration,
      source: "Manuell" as const,
      status: "Bestätigt" as const,
      note: note || null,
    };
    const res = await fetch("/api/reservations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!res.ok) { setError((await res.json()).error ?? "Fehler"); return; }
    router.push("/reservations");
    router.refresh();
  }

  const steps = [
    { n: 1, label: "Datum & Zeit" },
    { n: 2, label: "Gäste & Tisch" },
    { n: 3, label: "Kontakt" },
    { n: 4, label: "Bestätigung" },
  ];

  return (
    <>
      <div style={{
        padding: "18px 28px", borderBottom: "1px solid var(--hi-line)",
        display: "flex", alignItems: "center", gap: 0,
      }}>
        {steps.map((s, i) => {
          const done = s.n < step, active = s.n === step;
          return (
            <div key={s.n} style={{ display: "flex", alignItems: "center", flex: i === steps.length - 1 ? undefined : 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 14,
                  background: done ? "var(--hi-accent)" : active ? "color-mix(in oklch, var(--hi-accent) 20%, var(--hi-surface))" : "var(--hi-surface)",
                  border: `1.4px solid ${done ? "var(--hi-accent)" : active ? "var(--hi-accent)" : "var(--hi-line)"}`,
                  color: done ? "var(--hi-on-accent)" : active ? "var(--hi-accent)" : "var(--hi-muted)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 12, fontWeight: 600, fontFamily: '"Geist Mono", monospace',
                }}>
                  {done ? <HiIcon kind="check" size={14} /> : s.n}
                </div>
                <span style={{
                  fontSize: 12.5, fontWeight: 500,
                  color: active ? "var(--hi-ink)" : done ? "var(--hi-muted-strong)" : "var(--hi-muted)",
                }}>{s.label}</span>
              </div>
              {i < steps.length - 1 && <div style={{ flex: 1, height: 1, background: "var(--hi-line)", margin: "0 16px" }} />}
            </div>
          );
        })}
      </div>

      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1.2fr 1fr", minHeight: 0 }}>
        <div style={{ padding: "28px 32px", overflowY: "auto", borderRight: "1px solid var(--hi-line)" }}>
          <div style={{ maxWidth: 540, display: "flex", flexDirection: "column", gap: 20 }}>
            {step === 1 && (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <HiField label="Datum" type="date" value={date} onChange={(v) => setDT({ date: v, time })} />
                  <HiField label="Uhrzeit" type="time" value={time} mono onChange={(v) => setDT({ date, time: v })} />
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 500, color: "var(--hi-ink)", marginBottom: 10 }}>Aufenthalt</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {[60, 90, 120, 150, 180].map((m) => (
                      <button key={m} onClick={() => setDuration(m)} style={{
                        padding: "6px 12px", borderRadius: 8,
                        border: "1px solid",
                        borderColor: duration === m ? "var(--hi-accent)" : "var(--hi-line)",
                        background: duration === m ? "color-mix(in oklch, var(--hi-accent) 15%, var(--hi-surface))" : "var(--hi-surface-raised)",
                        color: duration === m ? "var(--hi-accent)" : "var(--hi-ink)",
                        fontSize: 12, fontFamily: '"Geist Mono", monospace', cursor: "pointer",
                      }}>{m} min</button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 500, color: "var(--hi-ink)", marginBottom: 10 }}>Personenzahl</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {[1, 2, 3, 4, 5, 6, 8, 10, 12].map((n) => (
                      <button key={n} onClick={() => setParty(n)} style={{
                        width: 44, height: 44, borderRadius: 10,
                        border: "1px solid",
                        borderColor: n === party ? "var(--hi-accent)" : "var(--hi-line)",
                        background: n === party ? "color-mix(in oklch, var(--hi-accent) 18%, var(--hi-surface))" : "var(--hi-surface)",
                        color: n === party ? "var(--hi-accent)" : "var(--hi-ink)",
                        fontSize: 14, fontWeight: 500, cursor: "pointer",
                        fontFamily: '"Geist Mono", monospace',
                      }}>{n}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 500, color: "var(--hi-ink)", marginBottom: 10 }}>Bereich</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <ZoneBtn label="Egal" selected={zoneId === null} onClick={() => setZoneId(null)} sub="Bester verfügbar" />
                    {zones.map((z) => (
                      <ZoneBtn key={z.id} label={z.name} selected={zoneId === z.id} onClick={() => setZoneId(z.id)}
                               sub={`${tables.filter((t) => t.zone_id === z.id).length} Tische`} />
                    ))}
                  </div>
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--hi-ink)" }}>
                  <input type="checkbox" checked={accessible} onChange={(e) => setAccessible(e.target.checked)}
                         style={{ accentColor: "var(--hi-accent)" }} />
                  ♿ Rollstuhlgerechter Tisch erforderlich
                </label>
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: "var(--hi-ink)" }}>
                      Tischvorschläge · {new Date(startsAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                    <span style={{ fontSize: 11, color: "var(--hi-muted)" }}>Automatisch nach Verfügbarkeit</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {candidates.map((c) => {
                      const zName = zones.find((z) => z.id === c.table.zone_id)?.name ?? "—";
                      const selected = (tableId ?? candidates[0]?.table.id) === c.table.id;
                      return (
                        <button key={c.table.id} onClick={() => setTableId(c.table.id)} style={{
                          padding: "12px 14px", borderRadius: 10,
                          border: "1.2px solid",
                          borderColor: selected ? "var(--hi-accent)" : "var(--hi-line)",
                          background: selected
                            ? "color-mix(in oklch, var(--hi-accent) 10%, var(--hi-surface))"
                            : "var(--hi-surface)",
                          display: "flex", alignItems: "center", gap: 12,
                          cursor: "pointer", textAlign: "left", width: "100%",
                        }}>
                          <HiTable shape={c.table.shape} seats={c.table.seats} label={c.table.label}
                                   status={selected ? "reserved" : "free"} size={44} />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 500, color: "var(--hi-ink)" }}>
                              Tisch {c.table.label} · {zName}
                            </div>
                            <div style={{ fontSize: 11.5, color: "var(--hi-muted)", marginTop: 2 }}>
                              {c.table.seats} Plätze · {c.table.shape === "round" ? "rund" : "eckig"}
                              {c.table.accessible ? " · ♿" : ""}
                            </div>
                          </div>
                          <HiPill tone={c.tone}>{c.reason}</HiPill>
                          {selected && <HiIcon kind="check" size={18} style={{ color: "var(--hi-accent)" }} />}
                        </button>
                      );
                    })}
                    {candidates.length === 0 && (
                      <div style={{
                        padding: 14, borderRadius: 10, border: "1px dashed var(--hi-line)",
                        color: "var(--hi-muted)", fontSize: 13, textAlign: "center",
                      }}>
                        Kein Tisch verfügbar. Anderen Slot oder Puffer anpassen.
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <HiField label="Gastname" value={name} onChange={setName} placeholder="z. B. Familie Müller" />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <HiField label="Telefon" value={phone} onChange={setPhone} placeholder="+49 …" mono />
                  <HiField label="E-Mail" type="email" value={email} onChange={setEmail} placeholder="optional" />
                </div>
                <HiField label="Notiz" value={note} onChange={setNote} placeholder="Allergien, Kinderwunsch, Anlass …" />
              </>
            )}

            {step === 4 && (
              <>
                <HiCard style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
                  <Row label="Gast" value={name || "—"} />
                  <Row label="Kontakt" value={phone || email || "—"} mono />
                  <Row label="Personen" value={`${party}`} />
                  <Row
                    label="Zeitpunkt"
                    value={`${new Date(startsAt).toLocaleString("de-DE", {
                      weekday: "short",
                      day: "numeric", month: "short",
                      hour: "2-digit", minute: "2-digit",
                    })} · ${duration} Min.`}
                  />
                  <Row label="Tisch" value={selectedTable ? `${selectedTable.label} · ${selectedZone?.name ?? "—"}` : "—"} />
                  {note && <Row label="Notiz" value={note} />}
                </HiCard>
                {error && <div style={{ color: "oklch(0.75 0.14 25)", fontSize: 12 }}>{error}</div>}
              </>
            )}

            <div style={{ display: "flex", gap: 10, paddingTop: 12, borderTop: "1px solid var(--hi-line)", marginTop: 4 }}>
              {step > 1 && (
                <HiBtn kind="outline" size="md" onClick={() => setStep(step - 1)}>← Zurück</HiBtn>
              )}
              <div style={{ flex: 1 }} />
              {step < 4 ? (
                <HiBtn kind="primary" size="md" icon="arrow" onClick={() => setStep(step + 1)}>
                  Weiter
                </HiBtn>
              ) : (
                <HiBtn kind="primary" size="md" icon="check" onClick={submit} disabled={saving}>
                  {saving ? "Speichern…" : "Reservierung anlegen"}
                </HiBtn>
              )}
            </div>
          </div>
        </div>

        <aside style={{
          padding: "28px 32px", background: "var(--hi-surface)",
          display: "flex", flexDirection: "column", gap: 18, overflowY: "auto",
        }}>
          <div style={{ fontSize: 11, color: "var(--hi-muted)", fontWeight: 600, letterSpacing: 0.8, textTransform: "uppercase" }}>
            Zusammenfassung
          </div>
          <HiCard style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <SummaryField label="Datum" value={new Date(startsAt).toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "short" })} />
              <SummaryField mono label="Uhrzeit" value={new Date(startsAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} sub={`Aufenthalt ${duration} Min.`} />
              <SummaryField label="Personen" value={`${party} Gäste`} />
              <SummaryField
                label="Tisch"
                value={selectedTable ? `${selectedTable.label} · ${selectedZone?.name ?? ""}` : "—"}
              />
            </div>
          </HiCard>
          <div>
            <div style={{ fontSize: 11, color: "var(--hi-muted)", fontWeight: 600, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 8 }}>
              Prüfung
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {candidates.length > 0 ? (
                <CheckRow ok label={`Tisch ${selectedTable?.label} verfügbar um ${new Date(startsAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}`} />
              ) : (
                <CheckRow ok={false} label="Kein passender Tisch im Slot gefunden" />
              )}
              <CheckRow ok label="Keine Überschneidung mit bestehenden Reservierungen" />
              <CheckRow ok label={`Freigabe-Timer greift nach ${duration + 15} Min.`} />
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}

function ZoneBtn({ label, sub, selected, onClick }: { label: string; sub: string; selected: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, padding: "10px 12px", borderRadius: 10, minWidth: 110,
      border: "1px solid",
      borderColor: selected ? "var(--hi-accent)" : "var(--hi-line)",
      background: selected ? "color-mix(in oklch, var(--hi-accent) 18%, var(--hi-surface))" : "var(--hi-surface)",
      color: "var(--hi-ink)", cursor: "pointer", textAlign: "left",
    }}>
      <div style={{ fontSize: 12.5, fontWeight: 500, color: selected ? "var(--hi-accent)" : "var(--hi-ink)" }}>
        {label}
      </div>
      <div style={{ fontSize: 10.5, color: "var(--hi-muted)", marginTop: 2 }}>{sub}</div>
    </button>
  );
}

function SummaryField({ label, value, sub, mono }: { label: string; value: string; sub?: string; mono?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, color: "var(--hi-muted)", marginBottom: 4, letterSpacing: 0.5 }}>{label.toUpperCase()}</div>
      <div className={mono ? "mono" : ""} style={{ fontSize: 15, fontWeight: 600, color: "var(--hi-ink)" }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "var(--hi-muted)" }}>{sub}</div>}
    </div>
  );
}

function CheckRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12, lineHeight: 1.4 }}>
      <HiIcon
        kind={ok ? "check" : "clock"}
        size={13}
        style={{ color: ok ? "oklch(0.75 0.13 145)" : "oklch(0.8 0.13 70)", marginTop: 2 }}
      />
      <span style={{ color: "var(--hi-muted-strong)" }}>{label}</span>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "110px 1fr", alignItems: "baseline", gap: 10 }}>
      <span style={{ fontSize: 10.5, color: "var(--hi-muted)", letterSpacing: 0.5 }}>{label.toUpperCase()}</span>
      <span className={mono ? "mono" : ""} style={{ fontSize: 14, color: "var(--hi-ink)", fontWeight: 500 }}>{value}</span>
    </div>
  );
}
