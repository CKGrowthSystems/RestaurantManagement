"use client";
import { useState } from "react";
import { HiBtn, HiCard, HiIcon, HiPill } from "@/components/primitives";

interface EndpointSpec {
  id: string;
  method: "GET" | "POST";
  path: string;
  desc: string;
  sample: Record<string, unknown> | null;
  hint: string;
}

const ENDPOINTS: EndpointSpec[] = [
  {
    id: "availability",
    method: "POST",
    path: "/api/v1/voice/availability",
    desc: "Prüft Tisch-Verfügbarkeit für einen Slot",
    sample: {
      party_size: 4,
      starts_at: "2026-04-22T19:30:00+02:00",
      duration_min: 90,
      zone: "Terrasse",
    },
    hint: "Antwort enthält best.label, best.seats, best.zone — der Agent kann direkt sagen 'Tisch A2 auf der Terrasse ist frei'.",
  },
  {
    id: "reservation",
    method: "POST",
    path: "/api/v1/voice/reservation",
    desc: "Legt Reservierung an (Auto-Assign + Approval-Workflow)",
    sample: {
      guest_name: "Familie Dimitriou",
      phone: "+49 171 1234567",
      party_size: 4,
      starts_at: "2026-04-22T19:30:00+02:00",
      duration_min: 90,
      zone: "Terrasse",
      note: "Kinderstuhl",
    },
    hint: "Response: requires_approval=true wenn größerer Tisch genutzt → Agent sagt 'wird noch bestätigt'. Sonst: 'verbindlich reserviert'.",
  },
  {
    id: "hours",
    method: "GET",
    path: "/api/v1/voice/hours",
    desc: "Öffnungszeiten pro Wochentag",
    sample: null,
    hint: "Response.hours = { mo:{open,close}, tu:{…}, … } — für Frage 'Wann habt ihr auf?'.",
  },
  {
    id: "cancel",
    method: "POST",
    path: "/api/v1/voice/cancel",
    desc: "Reservierung stornieren (per ID oder Telefon+Zeit)",
    sample: {
      phone: "+49 171 1234567",
      starts_at: "2026-04-22T19:30:00+02:00",
    },
    hint: "Findet bestehende Reservierung anhand von Telefon und Zeitpunkt (±30 Min).",
  },
];

const AGENT_PROMPT = `Du bist die Gastgeberin von {{restaurant_name}}. Du nimmst Telefonanrufe entgegen, antwortest auf Deutsch, warm und effizient, mit 'Sie'.

Begrüßung: "{{restaurant_name}}, guten Abend. Wie kann ich Ihnen helfen?"

Du hast vier Werkzeuge (Webhooks). Rufe sie zur Laufzeit auf, wenn nötig — alle mit Header \`X-Webhook-Secret: {{webhook_secret}}\`:

1. check_availability(party_size, starts_at, zone?) → POST {{base_url}}/availability
   Wenn ein Gast einen Tisch will: erst Verfügbarkeit prüfen, BEVOR du "ja" sagst.

2. create_reservation(guest_name, phone, party_size, starts_at, zone?, note?) → POST {{base_url}}/reservation
   Nach Zusage: Reservierung anlegen. Wenn Response 'requires_approval: true' liefert, sage dem Gast: "Ich habe Sie notiert, der Tisch wird noch bestätigt. Sie bekommen eine Bestätigung." Sonst: "Ich habe Sie fest eingetragen, Tisch {{assigned_table.label}}."

3. get_opening_hours() → GET {{base_url}}/hours
   Bei Fragen zu Öffnungszeiten — gib nur den Wochentag des Anrufs heraus, nicht die ganze Woche.

4. cancel_reservation(phone, starts_at) → POST {{base_url}}/cancel
   Bei Storno-Wunsch: Telefonnummer und Zeitpunkt verifizieren, dann aufrufen.

Regeln:
- IMMER Datum, Uhrzeit, Personenzahl WÖRTLICH wiederholen, bevor du buchst.
- Bei Unsicherheit nachfragen, nicht raten.
- Wenn außerhalb der Öffnungszeiten: höflich ablehnen, nächsten offenen Slot nennen.
- Sprich nie über Tischnummern in interner Form (z. B. 'T5'), formuliere immer natürlich: "ein Tisch im Innenraum".
- Bei technischen Problemen: "Ich verbinde Sie mit einem Kollegen" und Call eskalieren.`;

export function IntegrationWizard({ baseUrl, secret, restaurantName }: { baseUrl: string; secret: string; restaurantName: string }) {
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; body: string } | "loading">>({});
  const [expanded, setExpanded] = useState<string | null>("availability");

  async function test(ep: EndpointSpec) {
    setTestResults((prev) => ({ ...prev, [ep.id]: "loading" }));
    try {
      const init: RequestInit = {
        method: ep.method,
        headers: {
          "X-Webhook-Secret": secret,
          "Content-Type": "application/json",
        },
      };
      if (ep.method === "POST" && ep.sample) init.body = JSON.stringify(ep.sample);
      const res = await fetch(`${baseUrl}${ep.path}`, init);
      const body = await res.text();
      let pretty = body;
      try { pretty = JSON.stringify(JSON.parse(body), null, 2); } catch {}
      setTestResults((prev) => ({ ...prev, [ep.id]: { ok: res.ok, body: pretty } }));
    } catch (err) {
      setTestResults((prev) => ({ ...prev, [ep.id]: { ok: false, body: String(err) } }));
    }
  }

  const promptFilled = AGENT_PROMPT
    .replaceAll("{{restaurant_name}}", restaurantName)
    .replaceAll("{{webhook_secret}}", secret)
    .replaceAll("{{base_url}}", baseUrl + "/api/v1/voice");

  return (
    <HiCard style={{ padding: 0 }}>
      <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--hi-line)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--hi-ink)" }}>Demandly-Integration · Schritt-für-Schritt</div>
          <div style={{ fontSize: 11.5, color: "var(--hi-muted)" }}>
            Vier Webhook-Actions in deinem Workflow + ein System-Prompt für den Voice-Agent.
          </div>
        </div>
        <HiPill tone="success" dot>Webhook Secret aktiv</HiPill>
      </div>

      <div style={{ padding: "14px 18px 4px", display: "flex", flexDirection: "column", gap: 10 }}>
        <SharedHeader secret={secret} baseUrl={baseUrl} />

        {ENDPOINTS.map((ep, i) => {
          const open = expanded === ep.id;
          const url = `${baseUrl}${ep.path}`;
          const result = testResults[ep.id];
          return (
            <div key={ep.id} style={{
              border: "1px solid var(--hi-line)",
              borderRadius: 10,
              background: open ? "var(--hi-surface-raised)" : "var(--hi-surface)",
              overflow: "hidden",
            }}>
              <button
                onClick={() => setExpanded(open ? null : ep.id)}
                style={{
                  width: "100%", textAlign: "left", cursor: "pointer",
                  padding: "12px 14px", background: "transparent", border: "none",
                  display: "grid", gridTemplateColumns: "28px 70px 1fr auto",
                  gap: 12, alignItems: "center", color: "var(--hi-ink)",
                }}
              >
                <span style={{
                  width: 22, height: 22, borderRadius: 11,
                  background: "color-mix(in oklch, var(--hi-accent) 18%, transparent)",
                  color: "var(--hi-accent)",
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, fontWeight: 600, fontFamily: '"Geist Mono", monospace',
                }}>{i + 1}</span>
                <span className="mono" style={{
                  fontSize: 10.5, fontWeight: 600, textAlign: "center",
                  color: ep.method === "POST" ? "oklch(0.75 0.13 145)" : "oklch(0.8 0.1 235)",
                  padding: "2px 7px", borderRadius: 4,
                  background: ep.method === "POST" ? "rgba(90,170,110,0.12)" : "rgba(120,170,220,0.12)",
                }}>{ep.method}</span>
                <div style={{ minWidth: 0 }}>
                  <div className="mono" style={{ fontSize: 12.5, color: "var(--hi-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {ep.path}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--hi-muted)", marginTop: 2 }}>{ep.desc}</div>
                </div>
                <HiIcon kind="chevron" size={14} style={{ color: "var(--hi-muted)", transform: open ? "rotate(90deg)" : "rotate(0deg)", transition: "transform .15s" }} />
              </button>

              {open && (
                <div style={{ padding: "0 14px 14px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
                  <LabelledCopy label="URL" value={url} />
                  {ep.sample && <LabelledCopy label="Body (JSON)" value={JSON.stringify(ep.sample, null, 2)} mono />}
                  <div style={{ fontSize: 11, color: "var(--hi-muted-strong)", lineHeight: 1.5, padding: "6px 10px", background: "rgba(255,255,255,0.02)", borderRadius: 6 }}>
                    💡 {ep.hint}
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <HiBtn kind="outline" size="sm" icon="link" onClick={() => test(ep)} disabled={result === "loading"}>
                      {result === "loading" ? "Teste…" : "Jetzt testen"}
                    </HiBtn>
                    {result && result !== "loading" && (
                      <HiPill tone={result.ok ? "success" : "danger"} dot>
                        {result.ok ? "OK" : "Fehler"}
                      </HiPill>
                    )}
                  </div>
                  {result && result !== "loading" && (
                    <pre className="mono" style={{
                      margin: 0, padding: 10, fontSize: 11, lineHeight: 1.5,
                      background: "var(--hi-bg)", border: "1px solid var(--hi-line)",
                      borderRadius: 6, color: "var(--hi-muted-strong)",
                      overflowX: "auto", maxHeight: 240,
                    }}>{result.body}</pre>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ padding: "14px 18px", borderTop: "1px solid var(--hi-line)", marginTop: 8, background: "var(--hi-surface-raised)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--hi-ink)" }}>Voice-Agent System-Prompt</div>
            <div style={{ fontSize: 11, color: "var(--hi-muted)" }}>
              In Demandly → Voice-AI-Agent → System-Prompt einfügen. Platzhalter sind schon gefüllt.
            </div>
          </div>
          <CopyButton value={promptFilled} label="Prompt kopieren" />
        </div>
        <pre className="mono" style={{
          margin: 0, padding: 12, fontSize: 11, lineHeight: 1.6,
          background: "var(--hi-bg)", border: "1px solid var(--hi-line)",
          borderRadius: 8, color: "var(--hi-muted-strong)",
          maxHeight: 320, overflowY: "auto", whiteSpace: "pre-wrap",
        }}>{promptFilled}</pre>
      </div>
    </HiCard>
  );
}

function SharedHeader({ secret, baseUrl }: { secret: string; baseUrl: string }) {
  return (
    <div style={{
      padding: "10px 12px", borderRadius: 8,
      background: "color-mix(in oklch, var(--hi-accent) 8%, var(--hi-surface))",
      border: "1px solid color-mix(in oklch, var(--hi-accent) 30%, var(--hi-line))",
      display: "flex", flexDirection: "column", gap: 8,
    }}>
      <div style={{ fontSize: 11, color: "var(--hi-accent)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.8 }}>
        Für alle 4 Endpoints identisch
      </div>
      <LabelledCopy label="Basis-URL" value={baseUrl} />
      <LabelledCopy label="Header: X-Webhook-Secret" value={secret} />
      <div style={{ fontSize: 11, color: "var(--hi-muted)" }}>
        Content-Type: <span className="mono">application/json</span>
      </div>
    </div>
  );
}

function LabelledCopy({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
      <span style={{ fontSize: 10.5, color: "var(--hi-muted)", fontWeight: 500, letterSpacing: 0.5, minWidth: 110, textTransform: "uppercase" }}>
        {label}
      </span>
      <code style={{
        flex: 1, padding: "4px 8px", borderRadius: 5,
        background: "var(--hi-bg)", border: "1px solid var(--hi-line)",
        fontSize: 11.5, color: "var(--hi-ink)",
        fontFamily: mono || true ? '"Geist Mono", ui-monospace, monospace' : "inherit",
        overflowX: "auto", whiteSpace: mono ? "pre" : "nowrap", textOverflow: "ellipsis",
      }}>{value}</code>
      <CopyButton value={value} label="Kopieren" small />
    </div>
  );
}

function CopyButton({ value, label, small }: { value: string; label: string; small?: boolean }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }
  return (
    <HiBtn kind="outline" size={small ? "sm" : "md"} icon={copied ? "check" : "copy"} onClick={copy}>
      {copied ? "Kopiert" : label}
    </HiBtn>
  );
}
