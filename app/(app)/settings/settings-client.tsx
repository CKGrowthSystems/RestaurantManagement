"use client";
import { useEffect, useState } from "react";
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

      <HiCard style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--hi-ink)", marginBottom: 4 }}>Logo-URL</div>
        <div style={{ fontSize: 11.5, color: "var(--hi-muted)", marginBottom: 10 }}>
          Einfache URL zu einer PNG/SVG. Upload-Funktion folgt.
        </div>
        <input
          type="url"
          placeholder="https://..."
          value={branding.logo_url ?? ""}
          onChange={(e) => setBranding({ ...branding, logo_url: e.target.value || null })}
          style={textInputStyle}
        />
        {branding.logo_url && (
          <div style={{ marginTop: 12, padding: 12, background: "var(--hi-surface-raised)", borderRadius: 6, display: "flex", alignItems: "center", gap: 10 }}>
            <img src={branding.logo_url} alt="Logo" style={{ maxHeight: 40, maxWidth: 120, objectFit: "contain" }} />
            <span style={{ fontSize: 11.5, color: "var(--hi-muted)" }}>Vorschau</span>
          </div>
        )}
      </HiCard>

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
            <div style={{ fontSize: 13, fontWeight: 500, color: "var(--hi-ink)" }}>„Powered by Rhodos Tables" im Footer</div>
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
