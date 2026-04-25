/**
 * Email-Templates fuer HostSystem
 * ================================
 *
 * Pure Funktionen — geben { subject, html, text } zurueck. Keine Side-Effects,
 * keine DB-Calls. So bleiben die Templates testbar und gut zu pflegen.
 *
 * Design-Prinzipien:
 *   - Inline-Styles (Outlook + iOS Mail kennen kein <style>)
 *   - Max-Width 600px (Standard-Mail-Container)
 *   - Tabellen-Layout fuer maximale Client-Kompatibilitaet
 *   - Plain-Text-Fallback fuer jeden HTML-Block
 *   - Akzentfarbe pro Tenant aus Branding (fallback: Indigo)
 */

export type EmailTemplateContext = {
  restaurantName: string;
  primaryColor?: string | null;
  appUrl: string;
};

export type ReservationLite = {
  id: string;
  guest_name: string;
  party_size: number;
  starts_at: string;
  duration_min: number;
  source: string;
  code: string | null;
  table_label?: string | null;
  zone?: string | null;
  phone?: string | null;
  email?: string | null;
  note?: string | null;
  approval_reason?: string | null;
};

const FALLBACK_ACCENT = "#5B5BD6";

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("de-DE", {
    weekday: "long", day: "numeric", month: "long",
    hour: "2-digit", minute: "2-digit",
    timeZone: "Europe/Berlin",
  });
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("de-DE", {
    hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin",
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

/**
 * Wrappt Body-HTML in unsere Mail-Shell mit Branding-Header und Footer.
 */
function shell(ctx: EmailTemplateContext, bodyHtml: string): string {
  const accent = ctx.primaryColor ?? FALLBACK_ACCENT;
  const name = escapeHtml(ctx.restaurantName);
  return `<!DOCTYPE html>
<html lang="de">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f5f7;padding:24px 12px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        <tr><td style="padding:20px 28px;background:${accent};color:#ffffff;">
          <div style="font-size:14px;font-weight:600;letter-spacing:-0.2px;">${name}</div>
        </td></tr>
        <tr><td style="padding:28px;color:#1a1a1f;font-size:14px;line-height:1.55;">${bodyHtml}</td></tr>
        <tr><td style="padding:16px 28px;background:#fafafa;border-top:1px solid #ececef;color:#7a7a85;font-size:11.5px;text-align:center;">
          HostSystem &middot; Diese Nachricht wurde automatisch versendet, bitte nicht direkt antworten.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function row(label: string, value: string): string {
  return `<tr>
    <td style="padding:6px 12px 6px 0;color:#7a7a85;font-size:12.5px;width:120px;vertical-align:top;">${escapeHtml(label)}</td>
    <td style="padding:6px 0;color:#1a1a1f;font-size:13px;">${value}</td>
  </tr>`;
}

function reservationDetails(r: ReservationLite): string {
  const rows: string[] = [];
  rows.push(row("Gast", `<strong>${escapeHtml(r.guest_name)}</strong>`));
  rows.push(row("Personen", String(r.party_size)));
  rows.push(row("Wann", escapeHtml(fmtDateTime(r.starts_at))));
  if (r.duration_min) rows.push(row("Dauer", `${r.duration_min} Min.`));
  if (r.table_label) rows.push(row("Tisch", escapeHtml(r.table_label) + (r.zone ? ` <span style="color:#7a7a85;">(${escapeHtml(r.zone)})</span>` : "")));
  if (r.phone) rows.push(row("Telefon", escapeHtml(r.phone)));
  if (r.email) rows.push(row("E-Mail", escapeHtml(r.email)));
  if (r.code) rows.push(row("Buchungs-Nr.", `<code style="font-family:'SF Mono','Geist Mono',monospace;font-size:13px;background:#f0f0f3;padding:2px 6px;border-radius:4px;">${escapeHtml(r.code)}</code>`));
  if (r.note) rows.push(row("Notiz", escapeHtml(r.note)));
  rows.push(row("Quelle", escapeHtml(r.source)));
  return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:12px;border:1px solid #ececef;border-radius:8px;overflow:hidden;">
    <tr><td style="padding:12px 16px;"><table width="100%" cellpadding="0" cellspacing="0" border="0">${rows.join("")}</table></td></tr>
  </table>`;
}

function plainTextRow(label: string, value: string): string {
  return `${label.padEnd(14, " ")} ${value}`;
}

function reservationDetailsText(r: ReservationLite): string {
  const lines: string[] = [];
  lines.push(plainTextRow("Gast:", r.guest_name));
  lines.push(plainTextRow("Personen:", String(r.party_size)));
  lines.push(plainTextRow("Wann:", fmtDateTime(r.starts_at)));
  if (r.table_label) lines.push(plainTextRow("Tisch:", r.table_label + (r.zone ? ` (${r.zone})` : "")));
  if (r.phone) lines.push(plainTextRow("Telefon:", r.phone));
  if (r.email) lines.push(plainTextRow("E-Mail:", r.email));
  if (r.code) lines.push(plainTextRow("Buchungs-Nr.:", r.code));
  if (r.note) lines.push(plainTextRow("Notiz:", r.note));
  lines.push(plainTextRow("Quelle:", r.source));
  return lines.join("\n");
}

// =============================================================================
// 1. Reservation confirmed (auto-confirm path)
// =============================================================================

export function reservationConfirmedTemplate(
  r: ReservationLite,
  ctx: EmailTemplateContext,
): { subject: string; html: string; text: string } {
  const time = fmtTime(r.starts_at);
  const subject = `Neue Reservierung · ${r.guest_name} · ${time} Uhr (${r.party_size} P.)`;

  const link = `${ctx.appUrl}/reservations`;
  const body = `
    <h2 style="margin:0 0 4px;font-size:18px;font-weight:600;color:#1a1a1f;">Reservierung bestätigt</h2>
    <div style="color:#7a7a85;font-size:13px;margin-bottom:16px;">Eine neue Reservierung ist über die Voice-KI eingegangen und wurde automatisch bestätigt.</div>
    ${reservationDetails(r)}
    <div style="margin-top:24px;">
      <a href="${link}" style="display:inline-block;background:${ctx.primaryColor ?? FALLBACK_ACCENT};color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:7px;font-size:13px;font-weight:500;">In HostSystem öffnen</a>
    </div>
  `;
  const text = `Reservierung bestätigt — ${ctx.restaurantName}

Eine neue Reservierung ist über die Voice-KI eingegangen und wurde automatisch bestätigt.

${reservationDetailsText(r)}

Im HostSystem öffnen: ${link}
`;
  return { subject, html: shell(ctx, body), text };
}

// =============================================================================
// 2. Approval required (Stammtisch / VIP-Tisch)
// =============================================================================

export function approvalRequiredTemplate(
  r: ReservationLite,
  ctx: EmailTemplateContext,
): { subject: string; html: string; text: string } {
  const time = fmtTime(r.starts_at);
  const subject = `Freigabe erforderlich · ${r.guest_name} · ${time} Uhr (${r.party_size} P.)`;

  const link = `${ctx.appUrl}/dashboard`;
  const reason = r.approval_reason ? escapeHtml(r.approval_reason) : "Reservierung erfordert manuelle Bestätigung.";
  const body = `
    <div style="display:inline-block;background:#fff8e6;color:#8a6d00;padding:4px 10px;border-radius:5px;font-size:11.5px;font-weight:500;letter-spacing:0.4px;text-transform:uppercase;margin-bottom:10px;">Freigabe nötig</div>
    <h2 style="margin:0 0 4px;font-size:18px;font-weight:600;color:#1a1a1f;">Reservierung wartet auf Freigabe</h2>
    <div style="color:#7a7a85;font-size:13px;margin-bottom:8px;">${reason}</div>
    ${reservationDetails(r)}
    <div style="margin-top:24px;">
      <a href="${link}" style="display:inline-block;background:${ctx.primaryColor ?? FALLBACK_ACCENT};color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:7px;font-size:13px;font-weight:500;">Jetzt prüfen</a>
    </div>
  `;
  const text = `[FREIGABE NÖTIG] ${ctx.restaurantName}

${reason}

${reservationDetailsText(r)}

Jetzt prüfen: ${link}
`;
  return { subject, html: shell(ctx, body), text };
}

// =============================================================================
// 3. Reservation cancelled
// =============================================================================

export function cancelledTemplate(
  r: ReservationLite,
  ctx: EmailTemplateContext,
): { subject: string; html: string; text: string } {
  const time = fmtTime(r.starts_at);
  const subject = `Storno · ${r.guest_name} · ${time} Uhr (${r.party_size} P.)`;

  const link = `${ctx.appUrl}/reservations`;
  const body = `
    <h2 style="margin:0 0 4px;font-size:18px;font-weight:600;color:#1a1a1f;">Reservierung storniert</h2>
    <div style="color:#7a7a85;font-size:13px;margin-bottom:16px;">Diese Reservierung wurde gerade storniert. Tisch ist wieder verfügbar.</div>
    ${reservationDetails(r)}
    <div style="margin-top:24px;">
      <a href="${link}" style="display:inline-block;background:${ctx.primaryColor ?? FALLBACK_ACCENT};color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:7px;font-size:13px;font-weight:500;">In HostSystem öffnen</a>
    </div>
  `;
  const text = `Storno — ${ctx.restaurantName}

Die folgende Reservierung wurde gerade storniert. Tisch ist wieder verfügbar.

${reservationDetailsText(r)}

Im HostSystem öffnen: ${link}
`;
  return { subject, html: shell(ctx, body), text };
}

// =============================================================================
// 4. Daily digest
// =============================================================================

export type DailyDigestStats = {
  date: string;             // YYYY-MM-DD (Berlin local)
  reservations_total: number;
  guests_total: number;
  voice_calls_today: number;
  voice_calls_converted: number;
  no_shows: number;
  pending_approvals: number;
  upcoming: ReservationLite[];   // Top 5 fuer Vorschau
};

export function dailyDigestTemplate(
  stats: DailyDigestStats,
  ctx: EmailTemplateContext,
): { subject: string; html: string; text: string } {
  const dateLabel = new Date(`${stats.date}T12:00:00`).toLocaleDateString("de-DE", {
    weekday: "long", day: "numeric", month: "long",
    timeZone: "Europe/Berlin",
  });
  const subject = `Tages-Übersicht · ${dateLabel}`;

  const link = `${ctx.appUrl}/dashboard`;
  const accent = ctx.primaryColor ?? FALLBACK_ACCENT;

  const kpi = (label: string, value: string, sub?: string) => `
    <td style="padding:14px 16px;background:#fafafa;border:1px solid #ececef;border-radius:8px;width:25%;vertical-align:top;">
      <div style="font-size:10.5px;color:#7a7a85;text-transform:uppercase;letter-spacing:0.6px;font-weight:500;">${escapeHtml(label)}</div>
      <div style="font-family:'SF Mono','Geist Mono',monospace;font-size:22px;font-weight:600;color:#1a1a1f;letter-spacing:-0.3px;margin-top:4px;">${escapeHtml(value)}</div>
      ${sub ? `<div style="font-size:11px;color:#7a7a85;margin-top:2px;">${escapeHtml(sub)}</div>` : ""}
    </td>`;

  const upcomingRows = stats.upcoming.length === 0
    ? `<tr><td style="padding:14px 16px;color:#7a7a85;font-size:12.5px;text-align:center;">Keine weiteren Reservierungen heute.</td></tr>`
    : stats.upcoming.map((r) => `<tr><td style="padding:10px 16px;border-bottom:1px solid #ececef;">
        <div style="font-size:13px;color:#1a1a1f;font-weight:500;">${fmtTime(r.starts_at)} · ${escapeHtml(r.guest_name)} <span style="color:#7a7a85;font-weight:400;">(${r.party_size} P.)</span></div>
        ${r.table_label ? `<div style="font-size:11.5px;color:#7a7a85;margin-top:1px;">${escapeHtml(r.table_label)}${r.zone ? ` · ${escapeHtml(r.zone)}` : ""}</div>` : ""}
      </td></tr>`).join("");

  const body = `
    <h2 style="margin:0 0 4px;font-size:18px;font-weight:600;color:#1a1a1f;">Guten Morgen — Tages-Übersicht</h2>
    <div style="color:#7a7a85;font-size:13px;margin-bottom:18px;">${escapeHtml(dateLabel)}</div>

    <table width="100%" cellpadding="0" cellspacing="6" border="0" style="margin:0 -6px 18px;">
      <tr>
        ${kpi("Gäste heute", String(stats.guests_total))}
        ${kpi("Reservierungen", String(stats.reservations_total))}
        ${kpi("Voice-Calls", String(stats.voice_calls_today), `${stats.voice_calls_converted} gebucht`)}
        ${kpi("Offen", String(stats.pending_approvals), stats.pending_approvals > 0 ? "Freigabe nötig" : "")}
      </tr>
    </table>

    <div style="font-size:13px;font-weight:600;color:#1a1a1f;margin:18px 0 8px;">Anstehende Reservierungen</div>
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #ececef;border-radius:8px;overflow:hidden;">
      ${upcomingRows}
    </table>

    <div style="margin-top:24px;">
      <a href="${link}" style="display:inline-block;background:${accent};color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:7px;font-size:13px;font-weight:500;">Dashboard öffnen</a>
    </div>
  `;

  const upcomingText = stats.upcoming.length === 0
    ? "(Keine weiteren Reservierungen heute.)"
    : stats.upcoming.map((r) => `  • ${fmtTime(r.starts_at)}  ${r.guest_name} (${r.party_size} P.)${r.table_label ? ` — ${r.table_label}` : ""}`).join("\n");

  const text = `Tages-Übersicht · ${dateLabel}
${ctx.restaurantName}

Gäste heute:       ${stats.guests_total}
Reservierungen:    ${stats.reservations_total}
Voice-Calls:       ${stats.voice_calls_today} (${stats.voice_calls_converted} gebucht)
Freigabe nötig:    ${stats.pending_approvals}
No-Shows:          ${stats.no_shows}

Anstehende Reservierungen:
${upcomingText}

Dashboard öffnen: ${link}
`;
  return { subject, html: shell(ctx, body), text };
}
