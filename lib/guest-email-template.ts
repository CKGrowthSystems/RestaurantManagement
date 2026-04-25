/**
 * Guest-Email-Templates
 * ======================
 *
 * Rendert HTML-Mails an den Gast (Bestaetigung/Storno/Reminder) basierend
 * auf den vom Restaurant editierten Custom-Messages und den fixen
 * Termindetails. Pattern: identisch zu WhatsApp — Greeting + fixe Details
 * + Closing — nur eben als HTML-Mail mit Branding.
 */

import { composeMessage, type MessageVars } from "@/lib/message-vars";

export type GuestEmailKind = "confirmed" | "cancelled" | "reminder";

export type GuestEmailContext = {
  restaurantName: string;
  primaryColor?: string | null;
};

const FALLBACK_ACCENT = "#5B5BD6";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function nl2br(s: string): string {
  return escapeHtml(s).replace(/\n/g, "<br>");
}

function shell(ctx: GuestEmailContext, bodyHtml: string): string {
  const accent = ctx.primaryColor ?? FALLBACK_ACCENT;
  const name = escapeHtml(ctx.restaurantName);
  return `<!DOCTYPE html>
<html lang="de">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f5f7;padding:24px 12px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        <tr><td style="padding:22px 28px;background:${accent};color:#ffffff;">
          <div style="font-size:16px;font-weight:600;letter-spacing:-0.2px;">${name}</div>
        </td></tr>
        <tr><td style="padding:28px;color:#1a1a1f;font-size:14px;line-height:1.6;">${bodyHtml}</td></tr>
        <tr><td style="padding:14px 28px;background:#fafafa;border-top:1px solid #ececef;color:#7a7a85;font-size:11px;text-align:center;">
          ${name} &middot; Diese Nachricht wurde automatisch versendet.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

/**
 * Rendert die Email. Nutzt composeMessage (gleiche Logik wie WhatsApp)
 * aber das Ergebnis wird in HTML mit Branding gerendert.
 */
export function renderGuestEmail(
  kind: GuestEmailKind,
  vars: MessageVars,
  custom: any,           // GuestEmailSettings.custom_messages
  ctx: GuestEmailContext,
): { subject: string; html: string; text: string } {
  const composed = composeMessage(kind, vars, custom);

  const subject =
    kind === "confirmed" ? `Reservierung bestätigt · ${vars.date}, ${vars.time} Uhr` :
    kind === "cancelled" ? `Reservierung storniert · ${vars.date}` :
    `Erinnerung an Ihre Reservierung heute um ${vars.time} Uhr`;

  // Details-Block als hervorgehobene Karte
  const detailsHtml = `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0;border:1px solid #ececef;border-radius:8px;background:#fafafa;">
      <tr><td style="padding:14px 18px;color:#1a1a1f;font-size:14px;line-height:1.7;">
        ${nl2br(composed.details)}
      </td></tr>
    </table>
  `;

  const body = `
    <div style="font-size:15px;line-height:1.6;color:#1a1a1f;">${nl2br(composed.greeting)}</div>
    ${detailsHtml}
    <div style="font-size:14px;line-height:1.6;color:#1a1a1f;">${nl2br(composed.closing)}</div>
  `;

  const text = composed.full;

  return { subject, html: shell(ctx, body), text };
}
