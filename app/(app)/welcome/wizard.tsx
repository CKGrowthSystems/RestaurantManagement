"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { HiBtn, HiCard, HiIcon } from "@/components/primitives";

/**
 * Multi-Step-Wizard fuer Tenant-Onboarding.
 *
 * 4 Schritte mit Skip-Option pro Schritt:
 *  1. Restaurant-Profil — Public Name + Primaer-Farbe (Branding)
 *  2. Bereiche / Zonen — z.B. Innenraum + Terrasse
 *  3. Tische schnell anlegen — Anzahl pro Bereich
 *  4. Oeffnungszeiten — Standard-Schema (Mo-Sa, So geschlossen)
 *
 * Jeder Step persistiert direkt beim "Weiter"-Klick. Skip wird ignoriert
 * (Settings bleiben leer / Defaults greifen).
 *
 * Ende: PATCH restaurants.onboarding_completed_at = now() → Redirect Dashboard.
 */
export function OnboardingWizard({
  restaurantName, brandingInitial, hoursInitial, zonesCount, tablesCount, alreadyOnboarded,
}: {
  restaurantName: string;
  brandingInitial: any;
  hoursInitial: any;
  zonesCount: number;
  tablesCount: number;
  alreadyOnboarded: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // Step 1 — Branding
  const [publicName, setPublicName] = useState<string>(brandingInitial?.public_name ?? restaurantName);
  const [primaryColor, setPrimaryColor] = useState<string>(brandingInitial?.primary_color ?? "");

  // Step 2 — Zonen
  const [newZones, setNewZones] = useState<string[]>(
    zonesCount === 0 ? ["Innenraum", "Terrasse"] : []
  );

  // Step 3 — Tische pro Zone
  const [tablesByZone, setTablesByZone] = useState<Record<string, number>>({});

  // Step 4 — Öffnungszeiten (Standard 17-23, Mo-Sa)
  const [hoursDraft, setHoursDraft] = useState<Record<string, { open: string; close: string } | null>>(() => {
    if (hoursInitial && Object.keys(hoursInitial).length > 0) return hoursInitial;
    return {
      mo: { open: "17:00", close: "23:00" },
      tu: { open: "17:00", close: "23:00" },
      we: { open: "17:00", close: "23:00" },
      th: { open: "17:00", close: "23:00" },
      fr: { open: "17:00", close: "23:00" },
      sa: { open: "17:00", close: "23:00" },
      su: null,  // Sonntag default geschlossen
    };
  });

  async function saveStepAndAdvance() {
    setSaving(true);
    try {
      if (step === 0) {
        // Branding speichern
        await fetch("/api/settings", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            branding: {
              public_name: publicName,
              primary_color: primaryColor || null,
            },
          }),
        });
      } else if (step === 1) {
        // Zonen anlegen (wenn welche eingegeben)
        for (let i = 0; i < newZones.length; i++) {
          const name = newZones[i].trim();
          if (!name) continue;
          await fetch("/api/zones", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ name, sort_order: i }),
          });
        }
      } else if (step === 2) {
        // Tische anlegen — wir holen aktuelle Zonen + erstellen Tische je Zone
        const zonesRes = await fetch("/api/zones");
        const zonesJson = await zonesRes.json();
        for (const z of (zonesJson?.data ?? zonesJson ?? [])) {
          const count = tablesByZone[z.name] ?? 0;
          for (let i = 1; i <= count; i++) {
            await fetch("/api/tables", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                zone_id: z.id,
                label: `${z.name.slice(0, 1).toUpperCase()}${i}`,
                seats: 4,
                shape: "round",
              }),
            });
          }
        }
      } else if (step === 3) {
        // Öffnungszeiten speichern
        const cleaned: any = {};
        for (const k of ["mo", "tu", "we", "th", "fr", "sa", "su"]) {
          cleaned[k] = hoursDraft[k] ?? { open: "", close: "" };
        }
        await fetch("/api/settings", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ opening_hours: cleaned }),
        });
      }

      // Letzter Step → Onboarding markieren + redirect
      if (step === 3) {
        await fetch("/api/onboarding/complete", { method: "POST" });
        router.push("/dashboard");
        router.refresh();
        return;
      }

      setStep(step + 1);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  }

  async function skip() {
    if (step === 3) {
      // letzten Step markieren wir trotzdem als done — Restaurant kann's
      // jederzeit nachholen via /settings
      await fetch("/api/onboarding/complete", { method: "POST" });
      router.push("/dashboard");
      router.refresh();
      return;
    }
    setStep(step + 1);
  }

  return (
    <div style={{
      flex: 1, display: "flex", flexDirection: "column",
      padding: "32px 24px", maxWidth: 720, width: "100%", margin: "0 auto",
    }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, color: "var(--hi-muted)", textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 600 }}>
          Schritt {step + 1} von 4 {alreadyOnboarded && "· Re-Konfiguration"}
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 600, color: "var(--hi-ink)", margin: "8px 0 0", letterSpacing: -0.5 }}>
          {STEP_TITLES[step]}
        </h1>
        <p style={{ fontSize: 13.5, color: "var(--hi-muted)", margin: "8px 0 0", maxWidth: 540, lineHeight: 1.6 }}>
          {STEP_SUBTITLES[step]}
        </p>
      </div>

      {/* Progress-Bar */}
      <div style={{ display: "flex", gap: 6, marginBottom: 24 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{
            flex: 1, height: 3, borderRadius: 2,
            background: i <= step ? "var(--hi-accent)" : "var(--hi-line)",
          }} />
        ))}
      </div>

      {step === 0 && (
        <BrandingStep
          publicName={publicName} setPublicName={setPublicName}
          primaryColor={primaryColor} setPrimaryColor={setPrimaryColor}
        />
      )}
      {step === 1 && (
        <ZonesStep zones={newZones} setZones={setNewZones} existingCount={zonesCount} />
      )}
      {step === 2 && (
        <TablesStep zones={newZones.length > 0 ? newZones : ["Innenraum"]} tablesByZone={tablesByZone} setTablesByZone={setTablesByZone} existingCount={tablesCount} />
      )}
      {step === 3 && (
        <HoursStep hours={hoursDraft} setHours={setHoursDraft} />
      )}

      <div style={{ display: "flex", gap: 10, marginTop: 28, paddingTop: 24, borderTop: "1px solid var(--hi-line)" }}>
        {step > 0 && (
          <HiBtn kind="ghost" size="md" onClick={() => setStep(step - 1)}>
            ← Zurück
          </HiBtn>
        )}
        <div style={{ flex: 1 }} />
        <HiBtn kind="ghost" size="md" onClick={skip}>
          {step === 3 ? "Später erledigen" : "Überspringen"}
        </HiBtn>
        <HiBtn kind="primary" size="md" icon={step === 3 ? "check" : "arrow"} onClick={saveStepAndAdvance} disabled={saving}>
          {saving ? "Speichern…" : step === 3 ? "Fertig stellen" : "Weiter"}
        </HiBtn>
      </div>
    </div>
  );
}

const STEP_TITLES = [
  "Willkommen — wie heißt Ihr Restaurant?",
  "Welche Bereiche gibt es?",
  "Wie viele Tische pro Bereich?",
  "Wann haben Sie geöffnet?",
];
const STEP_SUBTITLES = [
  "Diese Angaben sieht der Gast in Bestätigungs-E-Mails und WhatsApp-Nachrichten.",
  "Bereiche helfen, Tische zu gruppieren — z.B. Innenraum, Terrasse, Wintergarten.",
  "Schnellanlage — Sie können später beliebig editieren, verschieben oder Tische dazufügen.",
  "Voice-AI antwortet außerhalb dieser Zeiten automatisch mit „geschlossen“.",
];

function BrandingStep({
  publicName, setPublicName, primaryColor, setPrimaryColor,
}: {
  publicName: string; setPublicName: (v: string) => void;
  primaryColor: string; setPrimaryColor: (v: string) => void;
}) {
  return (
    <HiCard style={{ padding: 24 }}>
      <Field label="Öffentlicher Name (sichtbar für Gäste)">
        <input
          value={publicName}
          onChange={(e) => setPublicName(e.target.value)}
          placeholder="z.B. Rhodos Ohlsbach"
          className="allow-select"
          style={inputStyle}
        />
      </Field>
      <Field label="Primärfarbe (für Branding in E-Mails + UI) — optional">
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="color"
            value={primaryColor || "#5B5BD6"}
            onChange={(e) => setPrimaryColor(e.target.value)}
            style={{ width: 50, height: 36, border: "1px solid var(--hi-line)", borderRadius: 6, background: "transparent", cursor: "pointer" }}
          />
          <input
            value={primaryColor}
            onChange={(e) => setPrimaryColor(e.target.value)}
            placeholder="#5B5BD6"
            className="allow-select"
            style={{ ...inputStyle, flex: 1 }}
          />
        </div>
      </Field>
    </HiCard>
  );
}

function ZonesStep({
  zones, setZones, existingCount,
}: {
  zones: string[]; setZones: (z: string[]) => void; existingCount: number;
}) {
  return (
    <HiCard style={{ padding: 24 }}>
      {existingCount > 0 && (
        <div style={{ padding: "10px 12px", marginBottom: 16, background: "var(--hi-surface-raised)", borderRadius: 6, fontSize: 12, color: "var(--hi-muted)" }}>
          ℹ️ Sie haben bereits {existingCount} Bereich{existingCount === 1 ? "" : "e"} angelegt — was Sie hier eingeben, wird zusätzlich erstellt.
        </div>
      )}
      {zones.map((z, i) => (
        <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <input
            value={z}
            onChange={(e) => setZones(zones.map((x, j) => j === i ? e.target.value : x))}
            placeholder={i === 0 ? "z.B. Innenraum" : "z.B. Terrasse"}
            className="allow-select"
            style={{ ...inputStyle, flex: 1 }}
          />
          {zones.length > 1 && (
            <HiBtn kind="ghost" size="md" onClick={() => setZones(zones.filter((_, j) => j !== i))}>
              <HiIcon kind="x" size={14} />
            </HiBtn>
          )}
        </div>
      ))}
      <HiBtn kind="outline" size="sm" icon="plus" onClick={() => setZones([...zones, ""])}>
        Bereich hinzufügen
      </HiBtn>
    </HiCard>
  );
}

function TablesStep({
  zones, tablesByZone, setTablesByZone, existingCount,
}: {
  zones: string[]; tablesByZone: Record<string, number>;
  setTablesByZone: (m: Record<string, number>) => void;
  existingCount: number;
}) {
  return (
    <HiCard style={{ padding: 24 }}>
      {existingCount > 0 && (
        <div style={{ padding: "10px 12px", marginBottom: 16, background: "var(--hi-surface-raised)", borderRadius: 6, fontSize: 12, color: "var(--hi-muted)" }}>
          ℹ️ Bereits {existingCount} Tisch{existingCount === 1 ? "" : "e"} im System — was Sie hier eingeben, kommt zusätzlich dazu.
        </div>
      )}
      {zones.filter((z) => z.trim()).map((z) => {
        const count = tablesByZone[z] ?? 0;
        return (
          <div key={z} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid var(--hi-line)" }}>
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 500, color: "var(--hi-ink)" }}>{z}</div>
              <div style={{ fontSize: 11.5, color: "var(--hi-muted)" }}>Tische à 4 Plätze, runde Form (alles editierbar in /tische)</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button
                onClick={() => setTablesByZone({ ...tablesByZone, [z]: Math.max(0, count - 1) })}
                style={countBtn}
              >−</button>
              <span className="mono" style={{ minWidth: 32, textAlign: "center", fontSize: 16, fontWeight: 600, color: "var(--hi-ink)" }}>
                {count}
              </span>
              <button
                onClick={() => setTablesByZone({ ...tablesByZone, [z]: count + 1 })}
                style={countBtn}
              >+</button>
            </div>
          </div>
        );
      })}
    </HiCard>
  );
}

function HoursStep({
  hours, setHours,
}: {
  hours: Record<string, { open: string; close: string } | null>;
  setHours: (h: Record<string, { open: string; close: string } | null>) => void;
}) {
  const days = [
    { k: "mo", l: "Montag" }, { k: "tu", l: "Dienstag" }, { k: "we", l: "Mittwoch" },
    { k: "th", l: "Donnerstag" }, { k: "fr", l: "Freitag" }, { k: "sa", l: "Samstag" },
    { k: "su", l: "Sonntag" },
  ];
  return (
    <HiCard style={{ padding: 24 }}>
      {days.map((d) => {
        const slot = hours[d.k];
        return (
          <div key={d.k} style={{ display: "grid", gridTemplateColumns: "100px 1fr 1fr auto", gap: 10, alignItems: "center", padding: "8px 0" }}>
            <div style={{ fontSize: 13, color: "var(--hi-ink)" }}>{d.l}</div>
            {slot ? (
              <>
                <input
                  type="time"
                  value={slot.open}
                  onChange={(e) => setHours({ ...hours, [d.k]: { ...slot, open: e.target.value } })}
                  style={inputStyle}
                />
                <input
                  type="time"
                  value={slot.close}
                  onChange={(e) => setHours({ ...hours, [d.k]: { ...slot, close: e.target.value } })}
                  style={inputStyle}
                />
                <button
                  onClick={() => setHours({ ...hours, [d.k]: null })}
                  style={{ ...countBtn, fontSize: 11, color: "var(--hi-muted)" }}
                >
                  zu
                </button>
              </>
            ) : (
              <>
                <div style={{ gridColumn: "2 / 4", fontSize: 12.5, color: "var(--hi-muted)", fontStyle: "italic" }}>
                  Geschlossen
                </div>
                <button
                  onClick={() => setHours({ ...hours, [d.k]: { open: "17:00", close: "23:00" } })}
                  style={{ ...countBtn, fontSize: 11 }}
                >
                  öffnen
                </button>
              </>
            )}
          </div>
        );
      })}
    </HiCard>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <label style={{ display: "block", fontSize: 11.5, color: "var(--hi-muted-strong)", fontWeight: 500, marginBottom: 6 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: "var(--hi-surface-raised)",
  border: "1px solid var(--hi-line)",
  borderRadius: 7,
  padding: "8px 12px",
  fontSize: 13,
  color: "var(--hi-ink)",
  outline: "none",
  width: "100%",
};

const countBtn: React.CSSProperties = {
  width: 32, height: 32, borderRadius: 6,
  border: "1px solid var(--hi-line)",
  background: "var(--hi-surface)",
  color: "var(--hi-ink)",
  fontSize: 16, fontWeight: 600,
  cursor: "pointer",
};
