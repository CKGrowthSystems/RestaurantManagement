/**
 * GoHighLevel / LeadConnector-Webhook-Sender
 * ============================================
 *
 * Empfohlener Hauptweg fuer Notifications. Statt direkt mit der Meta Cloud
 * API zu sprechen, schicken wir einen JSON-POST an einen GHL-Webhook
 * (Inbound Webhook Trigger im GHL-Workflow). Im GHL-Workflow konfiguriert
 * das Restaurant dann selbst den Versand-Branch (WhatsApp / SMS / Email
 * je nach `event`-Feld).
 *
 * Vorteile:
 *  - Tenant-Onboarding 5 Min statt 30 Min Meta-Setup
 *  - Templates leben in GHL (visueller Editor, automatische BSP-Approval)
 *  - Einheitliche Plattform mit Voice + Chat-Agent
 *  - Pro-Restaurant Kosten: $10/Monat plus per-message
 *
 * Architektur:
 *  HostSystem (Reservierung) → POST → GHL Webhook → GHL Workflow → WhatsApp
 *
 * Payload-Design: alle Felder die das Restaurant in einem Template
 * brauchen koennte — guest_first_name (parsed), date (formatted),
 * time (formatted), restaurant_name (branding-aware). So muss der GHL-
 * Workflow nichts mehr formatieren, nur Felder zuordnen.
 */

export type GhlNotificationEvent = "confirmed" | "cancelled" | "reminder";

export type GhlWebhookPayload = {
  event: GhlNotificationEvent;
  channel: "whatsapp";
  /** E.164 mit + (z.B. +4915112345678) — fuer GHL-Send-Action */
  to: string;
  /** Vollstaendiger Guest-Name wie eingegeben */
  guest_name: string;
  /** Geparster „erster Name" — „Familie Schmidt" / „Herr Mueller" / „Max" */
  guest_first_name: string;
  party_size: number;
  /** ISO-8601 mit Zeitzone */
  starts_at: string;
  /** Vorgefertigter deutscher String („Donnerstag, 25. April") */
  date: string;
  /** „19:30" */
  time: string;
  /** Beides zusammen — fuer einfache Single-Variable-Templates */
  starts_at_human: string;
  /** 5-stellige Buchungsnummer (oder null) */
  code: string | null;
  restaurant_name: string;
  reservation_id: string;
  /** Optional weitere Kontext-Felder fuers Template */
  table_label?: string | null;
  zone?: string | null;
};

export type GhlSendResult = {
  ok: boolean;
  status?: number;
  error?: string;
};

/**
 * Schickt eine Notification an den GHL-Webhook eines Tenants.
 * Best-Effort: failt der Webhook (404, Timeout, Server-Error), wird das
 * mit ok=false zurueckgegeben — Aufrufer entscheidet ob er fallback macht
 * oder einfach nur loggt.
 */
export async function sendGhlWebhook(
  webhookUrl: string,
  payload: GhlWebhookPayload,
): Promise<GhlSendResult> {
  if (!webhookUrl || !webhookUrl.startsWith("http")) {
    return { ok: false, error: "Invalid webhook URL" };
  }

  // GHL hat ein Default-Timeout von 30s, wir cappen unsererseits bei 10s
  // damit ein haengender Webhook den Reservation-Flow nicht blockiert.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) {
      return { ok: false, status: res.status, error: `GHL HTTP ${res.status}` };
    }
    return { ok: true, status: res.status };
  } catch (err: any) {
    if (err?.name === "AbortError") {
      return { ok: false, error: "GHL webhook timeout (10s)" };
    }
    return { ok: false, error: err?.message ?? String(err) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Hilfs-Funktion: parsed „Familie Schmidt" → bleibt „Familie Schmidt"
 * (wir wollen den Verband respektieren), „Max Mustermann" → „Max" (nur
 * Vorname). Identisch zu lib/whatsapp-templates.ts firstName, hier
 * dupliziert damit der GHL-Pfad keine Cross-Dependency braucht.
 */
export function parseFirstName(full: string): string {
  const trimmed = full.trim();
  const lower = trimmed.toLowerCase();
  if (lower.startsWith("familie ") || lower.startsWith("herr ") || lower.startsWith("frau ")) {
    return trimmed;
  }
  return trimmed.split(/\s+/)[0] || trimmed;
}
