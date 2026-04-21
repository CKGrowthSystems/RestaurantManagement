"use client";
import { useState } from "react";
import { HiBtn, HiCard, HiTable } from "@/components/primitives";
import type { Settings, ReleaseMode } from "@/lib/types";

const MODES: { id: ReleaseMode; label: string; desc: string }[] = [
  { id: "global", label: "Eine Regel für alle Tische", desc: "Einfach, konsistent, gut für kleine Teams" },
  { id: "zone",   label: "Pro Bereich unterschiedlich", desc: "Terrasse locker, Innenraum straff" },
  { id: "table",  label: "Pro Tisch individuell",       desc: "Maximale Kontrolle · Power-User" },
];

const TABS = [
  { id: "timer", label: "Freigabe-Timer" },
  { id: "hours", label: "Öffnungszeiten" },
  { id: "voice", label: "Voice-KI Prompt" },
  { id: "notify", label: "Benachrichtigungen" },
  { id: "theme", label: "Branding / Theme" },
  { id: "users", label: "Benutzer & Rollen" },
] as const;

export function SettingsClient({ initial }: { initial: Settings }) {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("timer");
  const [mode, setMode] = useState<ReleaseMode>(initial.release_mode);
  const [hold, setHold] = useState(initial.release_minutes);
  const [prompt, setPrompt] = useState(initial.voice_prompt ?? "");
  const [hours, setHours] = useState(initial.opening_hours);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaving(true); setSaved(false);
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ release_mode: mode, release_minutes: hold, voice_prompt: prompt, opening_hours: hours }),
    });
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div style={{ flex: 1, display: "grid", gridTemplateColumns: "220px 1fr", minHeight: 0 }}>
      <div style={{ borderRight: "1px solid var(--hi-line)", padding: "20px 12px", background: "var(--hi-surface)" }}>
        {TABS.map((t) => (
          <div key={t.id} onClick={() => setTab(t.id)} style={{
            padding: "8px 12px", borderRadius: 7, cursor: "pointer",
            fontSize: 12.5, fontWeight: 500,
            color: tab === t.id ? "var(--hi-ink)" : "var(--hi-muted-strong)",
            background: tab === t.id ? "var(--hi-surface-raised)" : "transparent",
            marginBottom: 2,
          }}>{t.label}</div>
        ))}
      </div>

      <div style={{ padding: "28px 32px", overflowY: "auto" }}>
        <div style={{ maxWidth: 820 }}>
          {tab === "timer" && (
            <>
              <Header
                title="Freigabe-Timer"
                sub="Erscheint ein Gast zur reservierten Zeit nicht, wird der Tisch automatisch nach Ablauf freigegeben und für Walk-ins verfügbar."
              />
              <HiCard style={{ padding: 20, marginBottom: 18 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: "var(--hi-ink)", marginBottom: 12 }}>Regel-Modus</div>
                <div style={{ display: "flex", gap: 10 }}>
                  {MODES.map((m) => (
                    <button key={m.id} onClick={() => setMode(m.id)} style={{
                      flex: 1, padding: "14px 14px", borderRadius: 10,
                      border: "1px solid",
                      borderColor: mode === m.id ? "var(--hi-accent)" : "var(--hi-line)",
                      background: mode === m.id ? "color-mix(in oklch, var(--hi-accent) 10%, var(--hi-surface))" : "transparent",
                      color: "var(--hi-ink)", textAlign: "left", cursor: "pointer",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                        <div style={{
                          width: 14, height: 14, borderRadius: 7,
                          border: `1.5px solid ${mode === m.id ? "var(--hi-accent)" : "var(--hi-muted)"}`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          {mode === m.id && <div style={{ width: 6, height: 6, borderRadius: 3, background: "var(--hi-accent)" }} />}
                        </div>
                        <span style={{ fontSize: 12.5, fontWeight: 600 }}>{m.label}</span>
                      </div>
                      <div style={{ fontSize: 11.5, color: "var(--hi-muted)", marginLeft: 20 }}>{m.desc}</div>
                    </button>
                  ))}
                </div>
              </HiCard>

              <HiCard style={{ padding: 20, marginBottom: 18 }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "var(--hi-ink)" }}>Wartezeit nach Reservierungsbeginn</div>
                    <div style={{ fontSize: 11.5, color: "var(--hi-muted)", marginTop: 2 }}>Tisch bleibt blockiert bis Ablauf</div>
                  </div>
                  <div className="mono" style={{ fontSize: 28, fontWeight: 600, color: "var(--hi-accent)", letterSpacing: -0.5 }}>
                    {hold} <span style={{ fontSize: 14, color: "var(--hi-muted)", fontWeight: 400 }}>Min.</span>
                  </div>
                </div>
                <input
                  type="range" min={5} max={60} step={5}
                  value={hold} onChange={(e) => setHold(+e.target.value)}
                  style={{ width: "100%", accentColor: "var(--hi-accent)" }}
                />
                <div className="mono" style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: "var(--hi-muted)", marginTop: 4 }}>
                  <span>5 min</span><span>15</span><span>30</span><span>45</span><span>60</span>
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--hi-line)" }}>
                  {[10, 15, 20, 30].map((p) => (
                    <button key={p} onClick={() => setHold(p)} style={{
                      padding: "5px 11px", borderRadius: 6, fontSize: 11.5,
                      border: "1px solid",
                      borderColor: hold === p ? "var(--hi-accent)" : "var(--hi-line)",
                      background: hold === p ? "color-mix(in oklch, var(--hi-accent) 15%, transparent)" : "transparent",
                      color: hold === p ? "var(--hi-accent)" : "var(--hi-muted-strong)",
                      cursor: "pointer", fontFamily: '"Geist Mono", monospace',
                    }}>{p} min</button>
                  ))}
                </div>
              </HiCard>

              <div style={{ fontSize: 11, color: "var(--hi-muted)", fontWeight: 600, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 10 }}>
                Live-Vorschau
              </div>
              <HiCard style={{ padding: 18 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <HiTable shape="round" seats={4} label="A2" status="countdown" size={52} countdown={`${String(hold).padStart(2, "0")}:00`} />
                  <div>
                    <div style={{ fontSize: 13, color: "var(--hi-ink)", fontWeight: 500 }}>
                      Reservierung 19:30 · Müller · 4 Personen
                    </div>
                    <div style={{ fontSize: 11.5, color: "var(--hi-muted)", marginTop: 2 }}>
                      Gast nicht erschienen · Timer läuft seit 19:30 · Freigabe nach {hold} Min.
                    </div>
                  </div>
                </div>
              </HiCard>
            </>
          )}

          {tab === "hours" && (
            <>
              <Header title="Öffnungszeiten" sub="Voice-KI antwortet bei Anrufen außerhalb dieser Zeiten automatisch mit 'geschlossen'." />
              <HiCard style={{ padding: 20, display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14 }}>
                {(["mo","tu","we","th","fr","sa","su"] as const).map((d) => {
                  const labels: Record<string, string> = { mo:"Montag", tu:"Dienstag", we:"Mittwoch", th:"Donnerstag", fr:"Freitag", sa:"Samstag", su:"Sonntag" };
                  const day = hours[d] ?? { open: "", close: "" };
                  return (
                    <div key={d} style={{ display: "grid", gridTemplateColumns: "110px 1fr 1fr", gap: 10, alignItems: "center" }}>
                      <span style={{ fontSize: 12.5, color: "var(--hi-ink)", fontWeight: 500 }}>{labels[d]}</span>
                      <input type="time" value={day.open}
                             onChange={(e) => setHours({ ...hours, [d]: { ...day, open: e.target.value } })}
                             style={inputStyle}/>
                      <input type="time" value={day.close}
                             onChange={(e) => setHours({ ...hours, [d]: { ...day, close: e.target.value } })}
                             style={inputStyle}/>
                    </div>
                  );
                })}
              </HiCard>
            </>
          )}

          {tab === "voice" && (
            <>
              <Header title="Voice-KI Prompt" sub="Grundhaltung, Tonalität und Eskalationsregeln, die die KI am Telefon verfolgt." />
              <HiCard style={{ padding: 20 }}>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder={"Du bist die Gastgeberin von Restaurant Rhodos. Begrüße mit 'Rhodos Ohlsbach, guten Abend.' Sei warm, präzise, bestätige immer Datum, Uhrzeit, Personenzahl. Bei unklarer Anfrage: nachfragen, nicht raten."}
                  style={{
                    width: "100%", minHeight: 220,
                    background: "var(--hi-surface-raised)",
                    border: "1px solid var(--hi-line)",
                    borderRadius: 8, padding: 12, fontSize: 13, lineHeight: 1.6,
                    color: "var(--hi-ink)", resize: "vertical", outline: "none",
                    fontFamily: "inherit",
                  }}
                />
              </HiCard>
            </>
          )}

          {tab !== "timer" && tab !== "hours" && tab !== "voice" && (
            <HiCard style={{ padding: 28, color: "var(--hi-muted)", fontSize: 13 }}>
              Sektion „{TABS.find((t) => t.id === tab)?.label}" wird in einem Folgerelease freigeschaltet.
            </HiCard>
          )}

          <div style={{ display: "flex", gap: 10, marginTop: 24, paddingTop: 20, borderTop: "1px solid var(--hi-line)" }}>
            {saved && (
              <span style={{ fontSize: 12, color: "oklch(0.78 0.12 145)", alignSelf: "center" }}>
                Gespeichert ✓
              </span>
            )}
            <div style={{ flex: 1 }} />
            <HiBtn kind="primary" size="md" icon="check" onClick={save} disabled={saving}>
              {saving ? "Speichern…" : "Änderungen speichern"}
            </HiBtn>
          </div>
        </div>
      </div>
    </div>
  );
}

function Header({ title, sub }: { title: string; sub: string }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--hi-ink)", margin: 0, letterSpacing: -0.2 }}>{title}</h2>
      <p style={{ fontSize: 13, color: "var(--hi-muted)", margin: "4px 0 0", lineHeight: 1.5, maxWidth: 540 }}>{sub}</p>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: "var(--hi-surface-raised)",
  border: "1px solid var(--hi-line)",
  borderRadius: 6, padding: "6px 10px",
  fontSize: 12.5, color: "var(--hi-ink)",
  fontFamily: '"Geist Mono", ui-monospace, monospace',
  outline: "none",
};
