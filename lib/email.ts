/**
 * Email-Sender (Resend) ohne Dependency
 * ======================================
 *
 * Sendet Mails via Resend's HTTP-API. Aktiv nur wenn RESEND_API_KEY und
 * RESEND_FROM gesetzt sind — sonst No-Op + Warning.
 *
 * Warum nicht resend npm?
 *  - Nur ein einziger HTTP-Call, keine SDK noetig
 *  - Edge/Node/Browser kompatibel
 *  - Wir kontrollieren Retry/Timeout selbst
 *
 * Resend-Free-Tier: 100 Mails/Tag, 3000/Monat. Reicht fuer Pilot-Phase.
 *
 * Env-Vars:
 *   RESEND_API_KEY=re_...
 *   RESEND_FROM="HostSystem <noreply@deinedomain.de>"  (verifizierte Domain noetig)
 */

export type EmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;          // Optional Plaintext-Fallback fuer Mail-Clients ohne HTML
  replyTo?: string;
  tags?: { name: string; value: string }[];  // Resend tagging fuer Analytics
};

export type EmailResult = {
  ok: boolean;
  id?: string;
  error?: string;
  skipped?: boolean;
};

export async function sendEmail(input: EmailInput): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!apiKey || !from) {
    return { ok: false, skipped: true, error: "RESEND_API_KEY or RESEND_FROM not configured" };
  }

  const body = {
    from,
    to: Array.isArray(input.to) ? input.to : [input.to],
    subject: input.subject,
    html: input.html,
    text: input.text,
    reply_to: input.replyTo,
    tags: input.tags,
  };

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.warn("[email] Resend rejected:", res.status, json?.message ?? json);
      return { ok: false, error: json?.message ?? `Resend HTTP ${res.status}` };
    }
    return { ok: true, id: json?.id };
  } catch (err: any) {
    console.warn("[email] send failed:", err?.message ?? err);
    return { ok: false, error: err?.message ?? String(err) };
  }
}

/**
 * Fire-and-forget: schluckt alle Errors, blockiert nie den Hot-Path.
 */
export function sendEmailAsync(input: EmailInput): void {
  void sendEmail(input).catch(() => {});
}

/**
 * True wenn Email-Versand konfiguriert ist. Praktisch fuer Settings-UI
 * oder Health-Check-Indikator.
 */
export function isEmailEnabled(): boolean {
  return !!(process.env.RESEND_API_KEY && process.env.RESEND_FROM);
}
