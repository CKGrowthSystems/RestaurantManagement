/**
 * WhatsApp-Sender (Meta Cloud API, per-Tenant)
 * =============================================
 *
 * Versand erfolgt mit den im settings.whatsapp gespeicherten Credentials
 * des jeweiligen Restaurants — d.h. die Nachricht an den Gast kommt von
 * der Restaurant-eigenen WhatsApp-Business-Nummer, nicht von HostSystem.
 *
 * BYO-Modell:
 *   1. Restaurant erstellt Meta Business Manager + WhatsApp-Business-Account
 *   2. Restaurant generiert System-User-Access-Token + holt Phone-Number-ID
 *   3. Diese Credentials werden im /settings → WhatsApp Tab eingetragen
 *   4. Restaurant erstellt + bekommt approved 3 Templates:
 *        - booking_confirmation_de
 *        - booking_cancellation_de
 *        - booking_reminder_de
 *
 * Dieses Modul kennt nur die Versand-Mechanik. Templates + Variablen-
 * Mapping leben in lib/whatsapp-templates.ts.
 */

import { createAdminClient } from "@/lib/supabase/server";

const META_API_VERSION = "v18.0";

export type WhatsAppCredentials = {
  enabled: boolean;
  phone_number_id: string;
  access_token: string;
  business_account_id?: string | null;
  send_on_confirmed: boolean;
  send_on_cancelled: boolean;
  send_reminder_hours_before: number;
  templates: {
    confirmation: string;
    cancellation: string;
    reminder: string;
  };
};

export type WhatsAppTemplateMessage = {
  to: string;                    // E.164 mit + (z.B. +4917123456789)
  template: string;              // Meta-approvter Template-Name
  language?: string;             // ISO-Code, default 'de'
  parameters: string[];          // Body-Variablen in Reihenfolge {{1}}, {{2}}, …
};

export type WhatsAppResult = {
  ok: boolean;
  message_id?: string;
  error?: string;
  skipped?: boolean;
  reason?: string;
};

/**
 * Laedt WhatsApp-Credentials fuer einen Tenant. Gibt null zurueck wenn
 * nicht konfiguriert oder explizit disabled.
 */
export async function getWhatsAppCredentials(
  restaurantId: string,
): Promise<WhatsAppCredentials | null> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.from("settings")
      .select("whatsapp")
      .eq("restaurant_id", restaurantId)
      .maybeSingle();
    if (error || !data) return null;
    const cfg = (data as any).whatsapp as Partial<WhatsAppCredentials> | null;
    if (!cfg || !cfg.enabled || !cfg.phone_number_id || !cfg.access_token) {
      return null;
    }
    return {
      enabled: true,
      phone_number_id: cfg.phone_number_id,
      access_token: cfg.access_token,
      business_account_id: cfg.business_account_id ?? null,
      send_on_confirmed: cfg.send_on_confirmed ?? true,
      send_on_cancelled: cfg.send_on_cancelled ?? true,
      send_reminder_hours_before: typeof cfg.send_reminder_hours_before === "number"
        ? cfg.send_reminder_hours_before
        : 2,
      templates: {
        confirmation: cfg.templates?.confirmation ?? "booking_confirmation_de",
        cancellation: cfg.templates?.cancellation ?? "booking_cancellation_de",
        reminder:     cfg.templates?.reminder     ?? "booking_reminder_de",
      },
    };
  } catch (err) {
    console.warn("[whatsapp] credential load failed:", err);
    return null;
  }
}

/**
 * Normalisiert eine deutsche Telefonnummer zu E.164. Akzeptiert:
 *   "0151 123 4567" → "+491511234567"
 *   "+49 151 1234567" → "+491511234567"
 *   "(0151) 1234-567" → "+491511234567"
 *   "00491511234567" → "+491511234567"
 *
 * Rueckgabe null wenn die Nummer offensichtlich Muell ist.
 */
export function normalizePhoneE164(input: string | null | undefined): string | null {
  if (!input) return null;
  let s = input.replace(/[^\d+]/g, "");
  if (!s) return null;
  if (s.startsWith("00")) s = "+" + s.slice(2);
  if (s.startsWith("0")) s = "+49" + s.slice(1);
  if (!s.startsWith("+")) s = "+" + s;
  // 10-15 Ziffern (E.164 spec)
  const digits = s.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return null;
  return s;
}

/**
 * Sendet eine Template-Nachricht. Best-Effort: gibt {ok:false, error}
 * zurueck wenn was schiefgeht — Aufrufer entscheidet was er macht.
 */
export async function sendWhatsAppTemplate(
  creds: WhatsAppCredentials,
  msg: WhatsAppTemplateMessage,
): Promise<WhatsAppResult> {
  const to = normalizePhoneE164(msg.to);
  if (!to) {
    return { ok: false, skipped: true, reason: "Invalid phone number", error: `Cannot normalize phone: ${msg.to}` };
  }

  const body = {
    messaging_product: "whatsapp",
    to: to.replace(/^\+/, ""),    // Meta will die Nummer ohne führendes +
    type: "template",
    template: {
      name: msg.template,
      language: { code: msg.language ?? "de" },
      components: [
        {
          type: "body",
          parameters: msg.parameters.map((text) => ({ type: "text", text })),
        },
      ],
    },
  };

  const url = `https://graph.facebook.com/${META_API_VERSION}/${creds.phone_number_id}/messages`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${creds.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      const errMsg = json?.error?.message ?? `Meta HTTP ${res.status}`;
      console.warn("[whatsapp] send rejected:", res.status, errMsg);
      return { ok: false, error: errMsg };
    }
    const messageId = json?.messages?.[0]?.id;
    return { ok: true, message_id: messageId };
  } catch (err: any) {
    console.warn("[whatsapp] send failed:", err?.message ?? err);
    return { ok: false, error: err?.message ?? String(err) };
  }
}

/**
 * Sicherheits-Helper: entfernt sensitive Felder aus WhatsApp-Config bevor
 * sie in einer API-Response landet (z.B. /api/settings GET).
 */
export function redactWhatsAppCredentials(cfg: any): any {
  if (!cfg || typeof cfg !== "object") return cfg;
  const { access_token, ...rest } = cfg;
  return {
    ...rest,
    access_token_set: !!access_token,           // Boolean-Indikator fuers UI
    // access_token wird NICHT zurueckgegeben
  };
}
