"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { HiBtn, HiCard, HiIcon, HiPill, HiTable } from "@/components/primitives";
import type { Settings, ReleaseMode, Branding, Notify, AppUser } from "@/lib/types";

const DEFAULT_BRANDING: Branding = {
  public_name: null,
  primary_color: null,
  accent_color: null,
  logo_url: null,
  powered_by: true,
};
const DEFAULT_NOTIFY: Notify = {
  email: null,
  phone: null,
  on_reservation: true,
  on_approval_required: true,
  on_cancel: false,
  daily_digest: false,
};

const MODES: { id: ReleaseMode; label: string; desc: string }[] = [
  { id: "global", label: "Eine Regel für alle Tische", desc: "Einfach, konsistent, gut für kleine Teams" },
  { id: "zone",   label: "Pro Bereich unterschiedlich", desc: "Terrasse locker, Innenraum straff" },
  { id: "table",  label: "Pro Tisch individuell",       desc: "Maximale Kontrolle · Power-User" },
];

const TABS = [
  { id: "profile", label: "Mein Profil" },
  { id: "timer", label: "Freigabe-Timer" },
  { id: "hours", label: "Öffnungszeiten" },
  { id: "calendar", label: "Kalender & Inhalte" },
  { id: "notify", label: "Benachrichtigungen" },
  { id: "theme", label: "Branding / Whitelabel" },
  { id: "users", label: "Benutzer & Rollen" },
] as const;

export function SettingsClient({ initial }: { initial: Settings }) {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("profile");
  const [mode, setMode] = useState<ReleaseMode>(initial.release_mode);
  const [hold, setHold] = useState(initial.release_minutes);
  const [hours, setHours] = useState(initial.opening_hours);
  const [branding, setBranding] = useState<Branding>({ ...DEFAULT_BRANDING, ...(initial.branding ?? {}) });
  const [notify, setNotify] = useState<Notify>({ ...DEFAULT_NOTIFY, ...(initial.notify ?? {}) });
  const [calendar, setCalendar] = useState<any>(initial.calendar ?? {});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaving(true); setSaved(false);
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        release_mode: mode,
        release_minutes: hold,
        opening_hours: hours,
        branding,
        notify,
        calendar,
      }),
    });
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div style={{ flex: 1, display: "grid", gridTemplateColumns: "220px 1fr", minHeight: 0 }}>
      <div style={{ borderRight: "1px solid var(--hi-line)", padding: "20px 12px", background: "var(--hi-surface)" }}>
        {TABS.map((t) => (
          <div
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`hi-settings-tab${tab === t.id ? " is-active" : ""}`}
          >
            {t.label}
          </div>
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
            <OpeningHoursTab hours={hours} setHours={setHours} />
          )}

          {tab === "calendar" && (
            <CalendarTab calendar={calendar} setCalendar={setCalendar} />
          )}

          {tab === "profile" && (
            <ProfileTab />
          )}

          {tab === "notify" && (
            <NotifyTab notify={notify} setNotify={setNotify} />
          )}

          {tab === "theme" && (
            <ThemeTab branding={branding} setBranding={setBranding} />
          )}

          {tab === "users" && (
            <UsersTab />
          )}

          {tab !== "profile" && tab !== "users" && (
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
          )}
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
const textInputStyle: React.CSSProperties = {
  ...inputStyle,
  fontFamily: "inherit",
  width: "100%",
};

// ============================================================================
// Mein Profil
// ============================================================================
// ============================================================================
// Oeffnungszeiten — mit Mehrfach-Slots pro Tag (Mittagspause-fähig)
// ============================================================================

const DAY_KEYS = ["mo", "tu", "we", "th", "fr", "sa", "su"] as const;
const DAY_LABELS: Record<string, string> = {
  mo: "Montag", tu: "Dienstag", we: "Mittwoch", th: "Donnerstag",
  fr: "Freitag", sa: "Samstag", su: "Sonntag",
};

type Slot = { open: string; close: string };
type HoursMap = Record<string, Slot | Slot[]>;

/** Daten lesen — Legacy oder neu, immer als Slot-Array zurueck. */
function readSlots(value: Slot | Slot[] | undefined): Slot[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (value.open || value.close) return [value];
  return [];
}

function OpeningHoursTab({
  hours, setHours,
}: { hours: HoursMap; setHours: (h: HoursMap) => void }) {
  function updateSlots(day: string, slots: Slot[]) {
    // Leere Slots ausfiltern, sonst bleibt halbeditierter Mist im DB-Wert
    const cleaned = slots.filter((s) => s.open && s.close);
    setHours({ ...hours, [day]: cleaned });
  }
  function addSlot(day: string) {
    const existing = readSlots(hours[day]);
    // Default-Werte: bei erstem Slot 11-22, bei zweitem die Pause-Phase
    const defaults: Slot = existing.length === 0
      ? { open: "11:00", close: "14:00" }
      : { open: "17:00", close: "22:00" };
    setHours({ ...hours, [day]: [...existing, defaults] });
  }
  function removeSlot(day: string, idx: number) {
    const existing = readSlots(hours[day]);
    const next = existing.filter((_, i) => i !== idx);
    setHours({ ...hours, [day]: next });
  }
  function updateSlot(day: string, idx: number, patch: Partial<Slot>) {
    const existing = readSlots(hours[day]);
    const next = existing.map((s, i) => (i === idx ? { ...s, ...patch } : s));
    updateSlots(day, next);
  }

  return (
    <>
      <Header
        title="Öffnungszeiten"
        sub={`Voice-KI antwortet bei Anrufen außerhalb dieser Zeiten mit "geschlossen". Pro Tag sind bis zu 3 Zeiträume möglich — z. B. 11–14 Uhr und 17–22 Uhr für eine Mittagspause.`}
      />
      <HiCard style={{ padding: 22, display: "flex", flexDirection: "column", gap: 14 }}>
        {DAY_KEYS.map((d) => {
          const slots = readSlots(hours[d]);
          const closed = slots.length === 0;
          return (
            <div
              key={d}
              style={{
                display: "grid", gridTemplateColumns: "120px 1fr", gap: 14,
                alignItems: "start",
                paddingBottom: 12, borderBottom: d === "su" ? "none" : "1px solid var(--hi-line)",
              }}
            >
              <span style={{ fontSize: 13, color: "var(--hi-ink)", fontWeight: 500, paddingTop: 6 }}>
                {DAY_LABELS[d]}
              </span>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {closed && (
                  <div style={{ fontSize: 12, color: "var(--hi-muted)", fontStyle: "italic" }}>
                    Geschlossen
                  </div>
                )}
                {slots.map((s, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr auto", gap: 8, alignItems: "center" }}>
                    <input
                      type="time"
                      value={s.open}
                      onChange={(e) => updateSlot(d, i, { open: e.target.value })}
                      style={inputStyle}
                    />
                    <span style={{ color: "var(--hi-muted)", fontSize: 12 }}>bis</span>
                    <input
                      type="time"
                      value={s.close}
                      onChange={(e) => updateSlot(d, i, { close: e.target.value })}
                      style={inputStyle}
                    />
                    <button
                      onClick={() => removeSlot(d, i)}
                      title="Zeitraum entfernen"
                      style={{
                        width: 28, height: 28, borderRadius: 6,
                        background: "transparent",
                        border: "1px solid var(--hi-line)",
                        color: "oklch(0.74 0.16 25)",
                        cursor: "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}
                    >
                      <HiIcon kind="trash" size={11} />
                    </button>
                  </div>
                ))}
                {slots.length < 3 && (
                  <button
                    onClick={() => addSlot(d)}
                    style={{
                      alignSelf: "flex-start",
                      padding: "6px 10px", borderRadius: 6,
                      fontSize: 11.5, fontWeight: 500,
                      background: "var(--hi-surface-raised)",
                      border: "1px dashed var(--hi-line)",
                      color: "var(--hi-muted-strong)",
                      cursor: "pointer",
                      display: "inline-flex", alignItems: "center", gap: 5,
                    }}
                  >
                    <HiIcon kind="plus" size={11} />
                    {slots.length === 0 ? "Öffnungszeit hinzufügen" : "Zweiten Zeitraum hinzufügen (z. B. nach Mittagspause)"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </HiCard>
    </>
  );
}

// ============================================================================
// Kalender & Inhalte — Voice-AI-Kontext
// Schliesstage / Sondertage / Ankuendigungen / Policies / PDF-Uploads
// ============================================================================

function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function CalendarTab({ calendar, setCalendar }: { calendar: any; setCalendar: (c: any) => void }) {
  // Helpers fuer einzelne Sektionen
  const closures = (calendar?.closures ?? []) as any[];
  const specialHours = (calendar?.special_hours ?? []) as any[];
  const announcements = (calendar?.announcements ?? []) as any[];
  const policies = (calendar?.policies ?? {}) as any;
  const highlights = (calendar?.menu_highlights ?? []) as string[];

  function update(patch: any) {
    setCalendar({ ...calendar, ...patch });
  }

  return (
    <>
      <Header
        title="Kalender & Inhalte"
        sub="Was die Voice-KI für jeden Anruf wissen muss: Urlaub, Sondertage, Ankündigungen, Speisekarte, Allergene und Hinweise zu Allergien/Kindern/Gruppen."
      />

      {/* SECTION 1: Schliesstage */}
      <ClosuresSection closures={closures} onChange={(v) => update({ closures: v })} />

      {/* SECTION 2: Sondertage */}
      <SpecialHoursSection items={specialHours} onChange={(v) => update({ special_hours: v })} />

      {/* SECTION 3: Ankuendigungen */}
      <AnnouncementsSection items={announcements} onChange={(v) => update({ announcements: v })} />

      {/* SECTION 4: Speisekarte (PDF) */}
      <DocumentSection
        title="Speisekarte"
        type="menu"
        document={calendar?.menu ?? null}
        onChanged={(doc) => update({ menu: doc })}
      />

      {/* SECTION 5: Allergene & Diaet (PDF) */}
      <DocumentSection
        title="Allergene & Diät-Info"
        type="allergens"
        document={calendar?.allergens ?? null}
        onChanged={(doc) => update({ allergens: doc })}
      />

      {/* SECTION 6: Menue-Highlights */}
      <MenuHighlightsSection items={highlights} onChange={(v) => update({ menu_highlights: v })} />

      {/* SECTION 7: Policies */}
      <PoliciesSection policies={policies} onChange={(v) => update({ policies: v })} />
    </>
  );
}

// ─────────────────────── Closures ───────────────────────

function ClosuresSection({ closures, onChange }: { closures: any[]; onChange: (next: any[]) => void }) {
  function add() {
    const today = new Date().toISOString().slice(0, 10);
    onChange([...closures, { id: newId(), from: today, to: today, reason: "", ai_message: "", blocks_booking: true }]);
  }
  function update(i: number, patch: any) {
    onChange(closures.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }
  function remove(i: number) {
    onChange(closures.filter((_, idx) => idx !== i));
  }

  return (
    <HiCard style={{ padding: 20, marginBottom: 16 }}>
      <SectionHeader icon="🌴" title="Schließtage / Urlaub" sub="Voice-KI lehnt Buchungen in diesen Zeiträumen automatisch ab." />
      {closures.length === 0 && <Empty text="Keine Schließtage hinterlegt." />}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {closures.map((c, i) => (
          <div key={c.id ?? i} style={cardStyle}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 10, marginBottom: 10 }}>
              <Field label="Von">
                <input type="date" value={c.from ?? ""} onChange={(e) => update(i, { from: e.target.value })} style={textInputStyle} />
              </Field>
              <Field label="Bis">
                <input type="date" value={c.to ?? ""} onChange={(e) => update(i, { to: e.target.value })} style={textInputStyle} />
              </Field>
              <Field label="Grund">
                <input type="text" placeholder="z.B. Sommerurlaub" value={c.reason ?? ""} onChange={(e) => update(i, { reason: e.target.value })} style={textInputStyle} />
              </Field>
              <button onClick={() => remove(i)} style={trashBtn}><HiIcon kind="trash" size={12} /></button>
            </div>
            <Field label="Ansage-Text für die KI (optional)">
              <input
                type="text"
                placeholder='z.B. "Wir machen vom 1. bis 15. August Urlaub. Ab dem 16. sind wir wieder da!"'
                value={c.ai_message ?? ""}
                onChange={(e) => update(i, { ai_message: e.target.value })}
                style={textInputStyle}
              />
            </Field>
            <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, fontSize: 11.5, color: "var(--hi-muted)" }}>
              <input type="checkbox" checked={c.blocks_booking !== false} onChange={(e) => update(i, { blocks_booking: e.target.checked })}
                     style={{ accentColor: "var(--hi-accent)" }} />
              Buchungen in diesem Zeitraum hart ablehnen (sonst nur Hinweis)
            </label>
          </div>
        ))}
      </div>
      <button onClick={add} style={addBtn}><HiIcon kind="plus" size={11} /> Schließtag hinzufügen</button>
    </HiCard>
  );
}

// ─────────────────────── Special Hours ───────────────────────

function SpecialHoursSection({ items, onChange }: { items: any[]; onChange: (next: any[]) => void }) {
  function add() {
    const today = new Date().toISOString().slice(0, 10);
    onChange([...items, { id: newId(), date: today, slots: [{ open: "11:00", close: "14:00" }], note: "" }]);
  }
  function update(i: number, patch: any) {
    onChange(items.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }
  function remove(i: number) {
    onChange(items.filter((_, idx) => idx !== i));
  }
  function updateSlot(i: number, sIdx: number, patch: any) {
    const slots = [...(items[i].slots ?? [])];
    slots[sIdx] = { ...slots[sIdx], ...patch };
    update(i, { slots });
  }
  function addSlot(i: number) {
    update(i, { slots: [...(items[i].slots ?? []), { open: "17:00", close: "22:00" }] });
  }
  function removeSlot(i: number, sIdx: number) {
    update(i, { slots: (items[i].slots ?? []).filter((_: any, k: number) => k !== sIdx) });
  }

  return (
    <HiCard style={{ padding: 20, marginBottom: 16 }}>
      <SectionHeader icon="🎄" title="Sondertage" sub="Einzelne Tage mit abweichenden Öffnungszeiten — Heiligabend, Sylvester, Feiertage." />
      {items.length === 0 && <Empty text="Keine Sondertage hinterlegt." />}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {items.map((s, i) => (
          <div key={s.id ?? i} style={cardStyle}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr auto", gap: 10, marginBottom: 10 }}>
              <Field label="Datum">
                <input type="date" value={s.date ?? ""} onChange={(e) => update(i, { date: e.target.value })} style={textInputStyle} />
              </Field>
              <Field label="Notiz">
                <input type="text" placeholder="z.B. Heiligabend nur mittags" value={s.note ?? ""} onChange={(e) => update(i, { note: e.target.value })} style={textInputStyle} />
              </Field>
              <button onClick={() => remove(i)} style={trashBtn}><HiIcon kind="trash" size={12} /></button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {(s.slots ?? []).map((slot: any, sIdx: number) => (
                <div key={sIdx} style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr auto", gap: 8, alignItems: "center" }}>
                  <input type="time" value={slot.open ?? ""} onChange={(e) => updateSlot(i, sIdx, { open: e.target.value })} style={textInputStyle} />
                  <span style={{ color: "var(--hi-muted)", fontSize: 12 }}>bis</span>
                  <input type="time" value={slot.close ?? ""} onChange={(e) => updateSlot(i, sIdx, { close: e.target.value })} style={textInputStyle} />
                  <button onClick={() => removeSlot(i, sIdx)} style={trashBtn}><HiIcon kind="trash" size={11} /></button>
                </div>
              ))}
              {(s.slots?.length ?? 0) < 3 && (
                <button onClick={() => addSlot(i)} style={{ ...addBtn, marginTop: 4 }}>
                  <HiIcon kind="plus" size={11} /> Zeitraum hinzufügen
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      <button onClick={add} style={addBtn}><HiIcon kind="plus" size={11} /> Sondertag hinzufügen</button>
    </HiCard>
  );
}

// ─────────────────────── Announcements ───────────────────────

function AnnouncementsSection({ items, onChange }: { items: any[]; onChange: (next: any[]) => void }) {
  function add() {
    onChange([...items, { id: newId(), message: "", active_from: null, active_until: null }]);
  }
  function update(i: number, patch: any) {
    onChange(items.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));
  }
  function remove(i: number) {
    onChange(items.filter((_, idx) => idx !== i));
  }

  return (
    <HiCard style={{ padding: 20, marginBottom: 16 }}>
      <SectionHeader icon="📢" title="Ankündigungen" sub="Was die KI erwähnen darf — z.B. Live-Musik, Tagesangebote, Renovation." />
      {items.length === 0 && <Empty text="Keine Ankündigungen aktiv." />}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {items.map((a, i) => (
          <div key={a.id ?? i} style={cardStyle}>
            <Field label="Ankündigung">
              <input
                type="text"
                placeholder='z.B. "Jeden Freitag Live-Musik ab 20 Uhr"'
                value={a.message ?? ""}
                onChange={(e) => update(i, { message: e.target.value })}
                style={textInputStyle}
              />
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 10, marginTop: 10 }}>
              <Field label="Aktiv ab (optional)">
                <input type="date" value={a.active_from ?? ""} onChange={(e) => update(i, { active_from: e.target.value || null })} style={textInputStyle} />
              </Field>
              <Field label="Aktiv bis (optional)">
                <input type="date" value={a.active_until ?? ""} onChange={(e) => update(i, { active_until: e.target.value || null })} style={textInputStyle} />
              </Field>
              <button onClick={() => remove(i)} style={{ ...trashBtn, alignSelf: "flex-end" }}><HiIcon kind="trash" size={12} /></button>
            </div>
          </div>
        ))}
      </div>
      <button onClick={add} style={addBtn}><HiIcon kind="plus" size={11} /> Ankündigung hinzufügen</button>
    </HiCard>
  );
}

// ─────────────────────── Document Upload (PDF) ───────────────────────

function DocumentSection({
  title, type, document, onChanged,
}: { title: string; type: "menu" | "allergens"; document: any; onChanged: (doc: any) => void }) {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [manualText, setManualText] = useState<string>(document?.manual_text ?? "");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setManualText(document?.manual_text ?? "");
  }, [document?.manual_text]);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null); setWarning(null); setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/branding/document?type=${type}`, { method: "POST", body: form });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      onChanged(data.document);
      if (data.warning) setWarning(data.warning);
      router.refresh();
    } catch (err: any) {
      setError(err?.message ?? "Upload fehlgeschlagen");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function onRemove() {
    if (!confirm(`${title} wirklich entfernen?`)) return;
    setError(null); setUploading(true);
    try {
      const res = await fetch(`/api/branding/document?type=${type}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Entfernen fehlgeschlagen");
      onChanged(null);
      router.refresh();
    } catch (err: any) {
      setError(err?.message ?? "Entfernen fehlgeschlagen");
    } finally {
      setUploading(false);
    }
  }

  async function saveManual() {
    setError(null); setUploading(true);
    try {
      const res = await fetch(`/api/branding/document?type=${type}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ manual_text: manualText }),
      });
      if (!res.ok) throw new Error("Speichern fehlgeschlagen");
      const data = await res.json();
      onChanged(data.document);
    } catch (err: any) {
      setError(err?.message ?? "Speichern fehlgeschlagen");
    } finally {
      setUploading(false);
    }
  }

  const hasDoc = !!(document?.pdf_url || document?.manual_text || document?.extracted_text);
  const charCount = (document?.extracted_text?.length ?? 0) + (document?.manual_text?.length ?? 0);

  return (
    <HiCard style={{ padding: 20, marginBottom: 16 }}>
      <SectionHeader icon={type === "menu" ? "🍽" : "⚠️"} title={title} sub={type === "menu" ? "Speisekarte als PDF — KI sucht im Text wenn Gäste nach Speisen, vegetarisch, glutenfrei usw. fragen." : "Allergen- & Diät-Informationen — KI antwortet bei entsprechenden Fragen aus diesem Dokument."} />

      {hasDoc && document?.pdf_url ? (
        <div style={{
          display: "flex", alignItems: "center", gap: 14,
          padding: 12, borderRadius: 8,
          background: "var(--hi-surface-raised)",
          border: "1px solid var(--hi-line)",
        }}>
          <div style={{
            width: 40, height: 50, borderRadius: 4,
            background: "color-mix(in oklch, var(--hi-accent) 14%, var(--hi-surface))",
            color: "var(--hi-accent)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, fontWeight: 700,
          }}>PDF</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <a href={document.pdf_url} target="_blank" rel="noopener" style={{ fontSize: 13, color: "var(--hi-ink)", fontWeight: 500, textDecoration: "none", display: "block" }}>
              {document.pdf_filename ?? "Dokument.pdf"}
            </a>
            <div style={{ fontSize: 10.5, color: "var(--hi-muted)", marginTop: 2 }}>
              {charCount > 0 ? `~${charCount.toLocaleString("de-DE")} Zeichen extrahiert` : "Kein Text — bitte manuell eintragen"} ·{" "}
              {document.uploaded_at ? new Date(document.uploaded_at).toLocaleDateString("de-DE", { day: "2-digit", month: "short", year: "numeric" }) : ""}
            </div>
          </div>
          <button onClick={() => fileRef.current?.click()} disabled={uploading} style={smallBtn}>{uploading ? "..." : "Ersetzen"}</button>
          <button onClick={onRemove} disabled={uploading} style={{ ...smallBtn, color: "oklch(0.74 0.16 25)", borderColor: "color-mix(in oklch, oklch(0.66 0.2 25) 30%, var(--hi-line))" }}>Entfernen</button>
        </div>
      ) : (
        <div
          onClick={() => fileRef.current?.click()}
          style={{
            cursor: uploading ? "wait" : "pointer",
            padding: "22px 18px", borderRadius: 10,
            border: "1.6px dashed var(--hi-line)",
            textAlign: "center", background: "var(--hi-surface-raised)",
            color: "var(--hi-muted-strong)", fontSize: 13,
          }}
        >
          <div style={{ fontWeight: 500, color: "var(--hi-ink)", marginBottom: 4 }}>
            {uploading ? "Lädt hoch..." : "PDF auswählen oder hierher ziehen"}
          </div>
          <div style={{ fontSize: 11, color: "var(--hi-muted)" }}>
            Max. 10 MB. Tipp: PDF muss durchsuchbar sein (kein Scan), sonst Text manuell eintragen.
          </div>
        </div>
      )}

      <input ref={fileRef} type="file" accept="application/pdf" onChange={onPick} style={{ display: "none" }} />

      {warning && (
        <div style={{
          marginTop: 10, padding: "8px 12px", borderRadius: 7, fontSize: 12,
          background: "color-mix(in oklch, oklch(0.75 0.14 70) 14%, transparent)",
          color: "oklch(0.85 0.13 70)",
          border: "1px solid color-mix(in oklch, oklch(0.75 0.14 70) 35%, var(--hi-line))",
        }}>{warning}</div>
      )}
      {error && (
        <div style={{
          marginTop: 10, padding: "8px 12px", borderRadius: 7, fontSize: 12,
          background: "color-mix(in oklch, oklch(0.66 0.2 25) 15%, transparent)",
          color: "oklch(0.82 0.14 25)",
          border: "1px solid color-mix(in oklch, oklch(0.66 0.2 25) 40%, var(--hi-line))",
        }}>{error}</div>
      )}

      <button onClick={() => setShowManual((s) => !s)} style={{ ...addBtn, marginTop: 12 }}>
        <HiIcon kind="edit" size={11} /> {showManual ? "Manuellen Text ausblenden" : "Text manuell anpassen / einfügen (Fallback)"}
      </button>
      {showManual && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 11, color: "var(--hi-muted)", marginBottom: 6 }}>
            Falls die PDF-Text-Extraktion ungenau war oder du gar kein PDF hast: hier den Text einfach reinpasten.
            Die KI durchsucht beides (PDF + Manueller Text), nimmt aber den manuellen Text bevorzugt.
          </div>
          <textarea
            value={manualText}
            onChange={(e) => setManualText(e.target.value)}
            rows={8}
            placeholder="VORSPEISEN&#10;Kalamares 8,90€ (Beilage Salat)&#10;Tzatziki 6,50€&#10;..."
            style={{ ...textInputStyle, fontFamily: '"Geist Mono", monospace', fontSize: 12, resize: "vertical", minHeight: 140 }}
          />
          <button onClick={saveManual} disabled={uploading} style={{ ...smallBtn, marginTop: 8 }}>{uploading ? "..." : "Manuellen Text speichern"}</button>
        </div>
      )}
    </HiCard>
  );
}

// ─────────────────────── Menue Highlights ───────────────────────

function MenuHighlightsSection({ items, onChange }: { items: string[]; onChange: (next: string[]) => void }) {
  return (
    <HiCard style={{ padding: 20, marginBottom: 16 }}>
      <SectionHeader icon="✨" title="Menü-Highlights" sub="Maximal 5 Stichpunkte — KI darf die erwähnen wenn ein Gast unsicher ist was er bestellen soll." />
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {items.map((h, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center" }}>
            <input
              type="text"
              value={h}
              onChange={(e) => onChange(items.map((x, idx) => (idx === i ? e.target.value : x)))}
              placeholder="z.B. Frische Meeresfrüchte aus Rhodos"
              style={textInputStyle}
            />
            <button onClick={() => onChange(items.filter((_, idx) => idx !== i))} style={trashBtn}>
              <HiIcon kind="trash" size={11} />
            </button>
          </div>
        ))}
      </div>
      {items.length < 5 && (
        <button onClick={() => onChange([...items, ""])} style={addBtn}>
          <HiIcon kind="plus" size={11} /> Highlight hinzufügen
        </button>
      )}
    </HiCard>
  );
}

// ─────────────────────── Policies ───────────────────────

function PoliciesSection({ policies, onChange }: { policies: any; onChange: (next: any) => void }) {
  function update(key: string, value: string) {
    onChange({ ...policies, [key]: value || null });
  }
  return (
    <HiCard style={{ padding: 20, marginBottom: 16 }}>
      <SectionHeader icon="📋" title="Hinweise & Richtlinien" sub="Was die KI sagen darf wenn Gäste danach fragen — ein Satz reicht. Leer = Anfrage an Kollegen weiterleiten." />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Allergien">
          <input type="text" value={policies?.allergies ?? ""} onChange={(e) => update("allergies", e.target.value)}
                 placeholder='z.B. "Bei Allergien bitte direkt mit dem Personal sprechen."'
                 style={textInputStyle} />
        </Field>
        <Field label="Kinder / Familie">
          <input type="text" value={policies?.kids ?? ""} onChange={(e) => update("kids", e.target.value)}
                 placeholder='z.B. "Wir haben Kinderstühle und kindgerechte Gerichte."'
                 style={textInputStyle} />
        </Field>
        <Field label="Gruppen ab 10 Personen">
          <input type="text" value={policies?.groups ?? ""} onChange={(e) => update("groups", e.target.value)}
                 placeholder='z.B. "Bitte direkt im Restaurant unter 07803 ... anrufen."'
                 style={textInputStyle} />
        </Field>
        <Field label="Dresscode">
          <input type="text" value={policies?.dress_code ?? ""} onChange={(e) => update("dress_code", e.target.value)}
                 placeholder='z.B. "Smart Casual — keine kurzen Hosen abends."'
                 style={textInputStyle} />
        </Field>
      </div>
    </HiCard>
  );
}

// ─────────────────────── Shared bits ───────────────────────

function SectionHeader({ icon, title, sub }: { icon: string; title: string; sub: string }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--hi-ink)", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 18 }}>{icon}</span> {title}
      </div>
      <div style={{ fontSize: 11.5, color: "var(--hi-muted)", marginTop: 4, lineHeight: 1.5 }}>{sub}</div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div style={{
      padding: 14, borderRadius: 8,
      border: "1.4px dashed var(--hi-line)",
      color: "var(--hi-muted)", fontSize: 12, textAlign: "center",
    }}>{text}</div>
  );
}

const cardStyle: React.CSSProperties = {
  padding: 14, borderRadius: 8,
  background: "var(--hi-surface-raised)",
  border: "1px solid var(--hi-line)",
};
const trashBtn: React.CSSProperties = {
  width: 30, height: 30, borderRadius: 6,
  background: "transparent",
  border: "1px solid var(--hi-line)",
  color: "oklch(0.74 0.16 25)",
  cursor: "pointer",
  display: "flex", alignItems: "center", justifyContent: "center",
};
const addBtn: React.CSSProperties = {
  marginTop: 10,
  padding: "8px 12px", borderRadius: 7,
  background: "var(--hi-surface-raised)",
  border: "1px dashed var(--hi-line)",
  color: "var(--hi-muted-strong)",
  fontSize: 12, fontWeight: 500,
  cursor: "pointer",
  display: "inline-flex", alignItems: "center", gap: 6,
};

function ProfileTab() {
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [role, setRole] = useState<string>("");
  const [displayName, setDisplayName] = useState("");
  const [savedName, setSavedName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/users/me", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const u = await res.json();
        setEmail(u.email);
        setRole(u.role);
        setDisplayName(u.display_name ?? "");
        setSavedName(u.display_name ?? "");
      } catch (err: any) {
        setError(err?.message ?? "Profil konnte nicht geladen werden.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const dirty = displayName.trim() !== savedName && displayName.trim().length > 0;

  async function save() {
    setSaving(true); setError(null); setSaved(false);
    try {
      const res = await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ display_name: displayName.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const u = await res.json();
      setSavedName(u.display_name);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      setError(err?.message ?? "Speichern fehlgeschlagen");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Header title="Mein Profil" sub="Wie dein Name im Dashboard und in Reservierungs-Notizen erscheint." />
      {loading && <HiCard style={{ padding: 28, color: "var(--hi-muted)" }}>Lade…</HiCard>}
      {!loading && (
        <HiCard style={{ padding: 22 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 18 }}>
            <Field label="E-Mail (nicht änderbar)">
              <input
                type="email"
                value={email ?? ""}
                disabled
                style={{ ...textInputStyle, opacity: 0.7, cursor: "not-allowed" }}
              />
            </Field>
            <Field label="Rolle">
              <input
                type="text"
                value={role}
                disabled
                style={{ ...textInputStyle, opacity: 0.7, cursor: "not-allowed", textTransform: "capitalize" }}
              />
            </Field>
          </div>
          <Field label="Anzeigename">
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={60}
              placeholder="Vor- und Nachname"
              style={textInputStyle}
            />
          </Field>
          {error && (
            <div style={{
              marginTop: 12, padding: "8px 12px", borderRadius: 7, fontSize: 12,
              background: "color-mix(in oklch, oklch(0.66 0.2 25) 15%, transparent)",
              color: "oklch(0.82 0.14 25)",
              border: "1px solid color-mix(in oklch, oklch(0.66 0.2 25) 40%, var(--hi-line))",
            }}>
              {error}
            </div>
          )}
          <div style={{ display: "flex", gap: 10, marginTop: 18, alignItems: "center" }}>
            {saved && (
              <span style={{ fontSize: 12, color: "oklch(0.78 0.12 145)" }}>Profil gespeichert ✓</span>
            )}
            <div style={{ flex: 1 }} />
            <HiBtn kind="primary" size="md" icon="check" onClick={save} disabled={!dirty || saving}>
              {saving ? "Speichern…" : "Profil speichern"}
            </HiBtn>
          </div>
        </HiCard>
      )}
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 11, fontWeight: 500, color: "var(--hi-muted)", letterSpacing: 0.3 }}>{label}</span>
      {children}
    </label>
  );
}

// ============================================================================
// Benachrichtigungen
// ============================================================================
function NotifyTab({ notify, setNotify }: { notify: Notify; setNotify: (n: Notify) => void }) {
  const row = (key: keyof Notify, label: string, desc: string) => (
    <label key={String(key)} style={{
      display: "flex", gap: 12, alignItems: "flex-start",
      padding: "12px 14px", borderRadius: 8,
      border: "1px solid var(--hi-line)", background: "var(--hi-surface)",
      cursor: "pointer",
    }}>
      <input
        type="checkbox"
        checked={!!notify[key]}
        onChange={(e) => setNotify({ ...notify, [key]: e.target.checked })}
        style={{ marginTop: 2, accentColor: "var(--hi-accent)" }}
      />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--hi-ink)" }}>{label}</div>
        <div style={{ fontSize: 11.5, color: "var(--hi-muted)", marginTop: 2 }}>{desc}</div>
      </div>
    </label>
  );
  return (
    <>
      <Header
        title="Benachrichtigungen"
        sub="Wer wird per E-Mail oder SMS informiert, wenn etwas passiert. Leer lassen = keine Benachrichtigungen."
      />
      <HiCard style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div>
            <div style={{ fontSize: 11.5, color: "var(--hi-muted)", marginBottom: 4, fontWeight: 500 }}>E-Mail</div>
            <input
              type="email"
              placeholder="inhaber@restaurant.de"
              value={notify.email ?? ""}
              onChange={(e) => setNotify({ ...notify, email: e.target.value || null })}
              style={textInputStyle}
            />
          </div>
          <div>
            <div style={{ fontSize: 11.5, color: "var(--hi-muted)", marginBottom: 4, fontWeight: 500 }}>Telefon (SMS/WhatsApp)</div>
            <input
              type="tel"
              placeholder="+49 171 ..."
              value={notify.phone ?? ""}
              onChange={(e) => setNotify({ ...notify, phone: e.target.value || null })}
              style={textInputStyle}
            />
          </div>
        </div>
      </HiCard>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {row("on_reservation",       "Neue Reservierung",        "Jede Voice-KI oder Web-Reservierung")}
        {row("on_approval_required", "Freigabe nötig",           "Wenn Voice-KI einen größeren Tisch vorgeschlagen hat")}
        {row("on_cancel",            "Stornierung",              "Wenn ein Gast storniert oder die Reservierung aufgehoben wird")}
        {row("daily_digest",         "Tages-Zusammenfassung",    "Um 22:00 Uhr: alle Reservierungen des Tages")}
      </div>
    </>
  );
}

// ============================================================================
// Branding / Whitelabel
// ============================================================================
const COLOR_PRESETS = [
  { label: "Rhodos Terracotta", primary: "#A8732F", accent: "#D19B58" },
  { label: "Midnight Blue",     primary: "#1E3A5F", accent: "#4A90C2" },
  { label: "Moss Green",        primary: "#3C5A3C", accent: "#7BA87B" },
  { label: "Burgundy Wine",     primary: "#722F37", accent: "#B85C67" },
  { label: "Onyx",              primary: "#1A1A1A", accent: "#D4AF37" },
];

/**
 * Logo-Upload als eigene Card. Nimmt eine PNG/JPG/SVG-Datei (max 2 MB),
 * laedt sie via /api/branding/logo zu Supabase Storage hoch, schreibt
 * settings.branding.logo_url und zeigt sofort eine Vorschau.
 */
function LogoUploadCard({ branding, setBranding }: { branding: Branding; setBranding: (b: Branding) => void }) {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null); setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/branding/logo", { method: "POST", body: form });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      setBranding({ ...branding, logo_url: data.logo_url });
      // Layout neu laden, damit das Logo SOFORT in der Sidebar erscheint
      // (kein manueller F5 mehr noetig).
      router.refresh();
    } catch (err: any) {
      setError(err?.message ?? "Upload fehlgeschlagen");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function onRemove() {
    if (!confirm("Logo wirklich entfernen?")) return;
    setError(null); setUploading(true);
    try {
      const res = await fetch("/api/branding/logo", { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setBranding({ ...branding, logo_url: null });
      router.refresh();
    } catch (err: any) {
      setError(err?.message ?? "Entfernen fehlgeschlagen");
    } finally {
      setUploading(false);
    }
  }

  return (
    <HiCard style={{ padding: 20, marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 500, color: "var(--hi-ink)", marginBottom: 4 }}>Logo</div>
      <div style={{ fontSize: 11.5, color: "var(--hi-muted)", marginBottom: 12 }}>
        PNG, JPG, SVG oder WebP — max. 2 MB. Wird in der Sidebar und in E-Mails an Gäste verwendet.
      </div>

      {branding.logo_url ? (
        <div style={{
          display: "flex", alignItems: "center", gap: 14,
          padding: 14, borderRadius: 8,
          background: "var(--hi-surface-raised)",
          border: "1px solid var(--hi-line)",
        }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={branding.logo_url}
            alt="Logo-Vorschau"
            style={{
              maxHeight: 48, maxWidth: 140, objectFit: "contain",
              background: "rgba(255,255,255,0.04)",
              padding: 6, borderRadius: 6,
            }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, color: "var(--hi-ink)", fontWeight: 500 }}>Aktives Logo</div>
            <div style={{ fontSize: 10.5, color: "var(--hi-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: '"Geist Mono", monospace', marginTop: 2 }}>
              {branding.logo_url}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              style={smallBtn}
            >
              {uploading ? "Lädt…" : "Ersetzen"}
            </button>
            <button
              onClick={onRemove}
              disabled={uploading}
              style={{ ...smallBtn, color: "oklch(0.74 0.16 25)", borderColor: "color-mix(in oklch, oklch(0.66 0.2 25) 30%, var(--hi-line))" }}
            >
              Entfernen
            </button>
          </div>
        </div>
      ) : (
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = "var(--hi-accent)"; }}
          onDragLeave={(e) => { e.currentTarget.style.borderColor = "var(--hi-line)"; }}
          onDrop={(e) => {
            e.preventDefault();
            e.currentTarget.style.borderColor = "var(--hi-line)";
            const file = e.dataTransfer.files?.[0];
            if (file && fileInputRef.current) {
              const dt = new DataTransfer();
              dt.items.add(file);
              fileInputRef.current.files = dt.files;
              fileInputRef.current.dispatchEvent(new Event("change", { bubbles: true }));
            }
          }}
          style={{
            cursor: uploading ? "wait" : "pointer",
            padding: "26px 18px",
            borderRadius: 10,
            border: "1.6px dashed var(--hi-line)",
            textAlign: "center",
            background: "var(--hi-surface-raised)",
            color: "var(--hi-muted-strong)",
            fontSize: 13,
            transition: "border-color 120ms ease, background 120ms ease",
          }}
        >
          <div style={{ fontWeight: 500, color: "var(--hi-ink)", marginBottom: 4 }}>
            {uploading ? "Lädt hoch…" : "Logo auswählen oder hierher ziehen"}
          </div>
          <div style={{ fontSize: 11, color: "var(--hi-muted)" }}>
            PNG · JPG · SVG · WebP — empfohlen 256×256 px, transparenter Hintergrund
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/svg+xml,image/webp"
        onChange={onPick}
        style={{ display: "none" }}
      />

      {error && (
        <div style={{
          marginTop: 10, padding: "8px 12px", borderRadius: 7, fontSize: 12,
          background: "color-mix(in oklch, oklch(0.66 0.2 25) 15%, transparent)",
          color: "oklch(0.82 0.14 25)",
          border: "1px solid color-mix(in oklch, oklch(0.66 0.2 25) 40%, var(--hi-line))",
        }}>
          {error}
        </div>
      )}
    </HiCard>
  );
}

const smallBtn: React.CSSProperties = {
  padding: "5px 10px", borderRadius: 6, fontSize: 11.5, fontWeight: 500,
  background: "var(--hi-surface)",
  border: "1px solid var(--hi-line)",
  color: "var(--hi-ink)",
  cursor: "pointer",
};

function ThemeTab({ branding, setBranding }: { branding: Branding; setBranding: (b: Branding) => void }) {
  return (
    <>
      <Header
        title="Branding / Whitelabel"
        sub="Wie heißt das Restaurant im System, welche Farben, welches Logo. Wird überall im Dashboard verwendet."
      />
      <HiCard style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--hi-ink)", marginBottom: 12 }}>Öffentlicher Name</div>
        <input
          type="text"
          placeholder="z. B. Restaurant Rhodos Ohlsbach"
          value={branding.public_name ?? ""}
          onChange={(e) => setBranding({ ...branding, public_name: e.target.value || null })}
          style={textInputStyle}
        />
        <div style={{ fontSize: 11.5, color: "var(--hi-muted)", marginTop: 6 }}>
          Wird in E-Mails, Bestätigungen und in der Sidebar angezeigt.
        </div>
      </HiCard>

      <LogoUploadCard branding={branding} setBranding={setBranding} />

      <HiCard style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--hi-ink)", marginBottom: 12 }}>Farbschema</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
          {COLOR_PRESETS.map((p) => {
            const active = branding.primary_color === p.primary && branding.accent_color === p.accent;
            return (
              <button
                key={p.label}
                onClick={() => setBranding({ ...branding, primary_color: p.primary, accent_color: p.accent })}
                style={{
                  padding: 12, borderRadius: 8, cursor: "pointer",
                  border: "1px solid", borderColor: active ? "var(--hi-accent)" : "var(--hi-line)",
                  background: active ? "color-mix(in oklch, var(--hi-accent) 8%, var(--hi-surface))" : "var(--hi-surface)",
                  display: "flex", alignItems: "center", gap: 10, textAlign: "left",
                }}
              >
                <div style={{ display: "flex", gap: 4 }}>
                  <div style={{ width: 20, height: 20, borderRadius: 5, background: p.primary, border: "1px solid rgba(0,0,0,0.2)" }} />
                  <div style={{ width: 20, height: 20, borderRadius: 5, background: p.accent, border: "1px solid rgba(0,0,0,0.2)" }} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 500, color: "var(--hi-ink)" }}>{p.label}</span>
              </button>
            );
          })}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--hi-line)" }}>
          <div>
            <div style={{ fontSize: 11.5, color: "var(--hi-muted)", marginBottom: 4 }}>Primärfarbe (hex)</div>
            <input
              type="text"
              placeholder="#A8732F"
              value={branding.primary_color ?? ""}
              onChange={(e) => setBranding({ ...branding, primary_color: e.target.value || null })}
              style={textInputStyle}
            />
          </div>
          <div>
            <div style={{ fontSize: 11.5, color: "var(--hi-muted)", marginBottom: 4 }}>Akzentfarbe (hex)</div>
            <input
              type="text"
              placeholder="#D19B58"
              value={branding.accent_color ?? ""}
              onChange={(e) => setBranding({ ...branding, accent_color: e.target.value || null })}
              style={textInputStyle}
            />
          </div>
        </div>
      </HiCard>

      <HiCard style={{ padding: 20 }}>
        <label style={{ display: "flex", gap: 12, alignItems: "flex-start", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={!!branding.powered_by}
            onChange={(e) => setBranding({ ...branding, powered_by: e.target.checked })}
            style={{ marginTop: 2, accentColor: "var(--hi-accent)" }}
          />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: "var(--hi-ink)" }}>„Powered by HostSystem" im Footer</div>
            <div style={{ fontSize: 11.5, color: "var(--hi-muted)", marginTop: 2 }}>
              Deaktivieren für vollständiges Whitelabel.
            </div>
          </div>
        </label>
      </HiCard>
    </>
  );
}

// ============================================================================
// Benutzer & Rollen
// ============================================================================
function UsersTab() {
  const [users, setUsers] = useState<AppUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/users", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) setUsers(data.users ?? []);
      } catch (err: any) {
        if (!cancelled) setError(err?.message ?? "Laden fehlgeschlagen");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <>
      <Header
        title="Benutzer & Rollen"
        sub="Wer hat Zugriff auf dieses Dashboard. Neue Benutzer anlegen darf nur der Inhaber."
      />
      <HiCard style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <div style={{ flex: 1, fontSize: 13, fontWeight: 500, color: "var(--hi-ink)" }}>Aktive Benutzer</div>
          <HiBtn kind="outline" size="sm" icon="plus" onClick={() => alert("Benutzer-Einladung: Admin-API folgt. Bis dahin bitte über Supabase-Dashboard anlegen.")}>
            Benutzer einladen
          </HiBtn>
        </div>
        {error && (
          <div style={{ padding: 10, fontSize: 12, color: "oklch(0.75 0.15 25)", background: "color-mix(in oklch, oklch(0.75 0.15 25) 10%, transparent)", borderRadius: 6 }}>
            {error}
          </div>
        )}
        {users === null && !error && (
          <div style={{ fontSize: 12, color: "var(--hi-muted)" }}>Lade Benutzer…</div>
        )}
        {users && users.length === 0 && (
          <div style={{ fontSize: 12, color: "var(--hi-muted)" }}>Keine Benutzer gefunden.</div>
        )}
        {users && users.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {users.map((u) => (
              <div key={u.id} style={{
                display: "grid", gridTemplateColumns: "32px 1fr auto auto", gap: 12, alignItems: "center",
                padding: "10px 12px", borderRadius: 7,
                background: "var(--hi-surface)", border: "1px solid var(--hi-line)",
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: "color-mix(in oklch, var(--hi-accent) 18%, var(--hi-surface))",
                  color: "var(--hi-accent)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, fontWeight: 600,
                }}>
                  {u.display_name.slice(0, 2).toUpperCase()}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--hi-ink)" }}>{u.display_name}</div>
                  <div style={{ fontSize: 11, color: "var(--hi-muted)" }}>{u.email}</div>
                </div>
                <HiPill tone={u.role === "owner" ? "accent" : u.role === "manager" ? "warn" : "neutral"}>
                  {u.role}
                </HiPill>
                <div style={{ fontSize: 10.5, color: "var(--hi-muted)", fontFamily: '"Geist Mono", monospace' }}>
                  {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleDateString("de-DE") : "—"}
                </div>
              </div>
            ))}
          </div>
        )}
      </HiCard>
      <HiCard style={{ padding: 16, fontSize: 12, color: "var(--hi-muted)", lineHeight: 1.6 }}>
        <strong style={{ color: "var(--hi-ink)" }}>Rollen-Hinweis:</strong> „Owner" kann alles, „Manager" kann Reservierungen und Tische verwalten, „Staff" nur anschauen und bestätigen. Rollenwechsel derzeit über Supabase-Console.
      </HiCard>
    </>
  );
}
