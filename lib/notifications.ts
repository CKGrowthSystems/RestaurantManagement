/**
 * Notification-Orchestration
 * ===========================
 *
 * Liest Settings (notify + branding) fuer einen Tenant, baut den richtigen
 * Email-Body und feuert die Mail los — fire-and-forget.
 *
 * Aufrufer muss nur (restaurantId, reservationId, kind) uebergeben — den Rest
 * loesen wir hier auf. So bleibt der Hot-Path in den Reservation-Routen
 * sauber, und alle Email-Logik lebt an einer Stelle.
 *
 * Best-Effort: failt das Senden (kein API-Key, Notify aus, Settings-Loading-
 * Error), wird das geschluckt + console.warn. Hauptflow geht nicht kaputt.
 */

import { createAdminClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";
import {
  reservationConfirmedTemplate,
  approvalRequiredTemplate,
  cancelledTemplate,
  type ReservationLite,
  type EmailTemplateContext,
} from "@/lib/email-templates";
import { getWhatsAppCredentials, sendWhatsAppTemplate } from "@/lib/whatsapp";
import { confirmationParams, cancellationParams } from "@/lib/whatsapp-templates";

export type NotificationKind = "confirmed" | "approval_required" | "cancelled";

type SettingsRow = {
  notify: {
    email: string | null;
    on_reservation: boolean;
    on_approval_required: boolean;
    on_cancel: boolean;
  } | null;
  branding: {
    public_name: string | null;
    primary_color: string | null;
  } | null;
};

type ResRow = {
  id: string;
  guest_name: string;
  party_size: number;
  starts_at: string;
  duration_min: number;
  source: string;
  code: string | null;
  phone: string | null;
  email: string | null;
  note: string | null;
  approval_reason: string | null;
  table_id: string | null;
  whatsapp_consent?: boolean;
};

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3030");

/**
 * Triggers eine Notification falls in den Settings aktiviert.
 * Fire-and-forget — keine Promise wird returned, Aufrufer wartet nicht.
 */
export function notifyAsync(input: {
  restaurantId: string;
  reservationId: string;
  kind: NotificationKind;
}): void {
  void notify(input).catch((err) => {
    console.warn("[notifications] failed:", err?.message ?? err);
  });
}

async function notify(input: {
  restaurantId: string;
  reservationId: string;
  kind: NotificationKind;
}): Promise<void> {
  const { restaurantId, reservationId, kind } = input;
  const admin = createAdminClient();

  // Settings + Reservation parallel laden
  const [
    { data: settings },
    { data: restaurant },
    { data: reservation },
  ] = await Promise.all([
    admin.from("settings")
      .select("notify, branding")
      .eq("restaurant_id", restaurantId)
      .maybeSingle(),
    admin.from("restaurants")
      .select("name")
      .eq("id", restaurantId)
      .maybeSingle(),
    admin.from("reservations")
      .select("*")
      .eq("id", reservationId)
      .eq("restaurant_id", restaurantId)
      .maybeSingle(),
  ]);

  const s = (settings ?? {}) as SettingsRow;
  const r = reservation as ResRow | null;
  if (!r) return;

  // Email-Toggles checken — wenn aus, wird nur WhatsApp evaluiert.
  const notifyCfg = s.notify ?? null;
  const recipientEmailRaw = notifyCfg?.email?.trim() ?? null;
  const emailKindEnabled =
    (kind === "confirmed" && notifyCfg?.on_reservation) ||
    (kind === "approval_required" && notifyCfg?.on_approval_required) ||
    (kind === "cancelled" && notifyCfg?.on_cancel);
  const recipientEmail = recipientEmailRaw && emailKindEnabled ? recipientEmailRaw : null;

  // Tisch-Label + Zone optional nachladen
  let tableLabel: string | null = null;
  let zoneName: string | null = null;
  if (r.table_id) {
    const { data: table } = await admin.from("tables")
      .select("label, zone_id")
      .eq("id", r.table_id)
      .maybeSingle();
    tableLabel = (table as any)?.label ?? null;
    if ((table as any)?.zone_id) {
      const { data: zone } = await admin.from("zones")
        .select("name")
        .eq("id", (table as any).zone_id)
        .maybeSingle();
      zoneName = (zone as any)?.name ?? null;
    }
  }

  const branding = s.branding ?? null;
  const restaurantName =
    branding?.public_name?.trim() ||
    (restaurant as any)?.name ||
    "Ihr Restaurant";

  const ctx: EmailTemplateContext = {
    restaurantName,
    primaryColor: branding?.primary_color ?? null,
    appUrl: APP_URL,
  };

  const lite: ReservationLite = {
    id: r.id,
    guest_name: r.guest_name,
    party_size: r.party_size,
    starts_at: r.starts_at,
    duration_min: r.duration_min,
    source: r.source,
    code: r.code,
    table_label: tableLabel,
    zone: zoneName,
    phone: r.phone,
    email: r.email,
    note: r.note,
    approval_reason: r.approval_reason,
  };

  const tpl =
    kind === "confirmed" ? reservationConfirmedTemplate(lite, ctx) :
    kind === "approval_required" ? approvalRequiredTemplate(lite, ctx) :
    cancelledTemplate(lite, ctx);

  // 1) Team-Mail (Restaurant-Email)
  if (recipientEmail) {
    await sendEmail({
      to: recipientEmail,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
      tags: [
        { name: "kind", value: kind },
        { name: "restaurant_id", value: restaurantId },
      ],
    });
  }

  // 2) Guest-WhatsApp (an die Telefonnummer des Gasts via Tenant-eigener Nummer)
  // Nur fuer confirmed + cancelled (approval_required ist team-intern, nicht
  // an den Gast — der weiss noch gar nicht ob seine Reservierung kommt).
  if (kind === "confirmed" || kind === "cancelled") {
    await maybeSendGuestWhatsApp({
      restaurantId,
      kind,
      reservation: r,
      restaurantName,
    });
  }
}

/**
 * Versendet die WhatsApp-Bestaetigung/-Storno an den Gast — sofern
 * Tenant-WhatsApp konfiguriert ist UND die Setting-Toggle erlaubt UND
 * der Gast eine Telefonnummer hinterlassen hat.
 */
async function maybeSendGuestWhatsApp(input: {
  restaurantId: string;
  kind: "confirmed" | "cancelled";
  reservation: ResRow;
  restaurantName: string;
}): Promise<void> {
  const { restaurantId, kind, reservation, restaurantName } = input;
  if (!reservation.phone) return;        // ohne Phone kein WhatsApp

  // DSGVO-Consent: nur senden wenn der Gast NICHT explizit abgelehnt hat.
  // Default true (Spalte default in DB). Nur false → kein Versand.
  if (reservation.whatsapp_consent === false) return;

  const creds = await getWhatsAppCredentials(restaurantId);
  if (!creds) return;
  if (kind === "confirmed" && !creds.send_on_confirmed) return;
  if (kind === "cancelled" && !creds.send_on_cancelled) return;

  const guestData = {
    guest_name: reservation.guest_name,
    party_size: reservation.party_size,
    starts_at: reservation.starts_at,
    code: reservation.code,
  };
  const restaurant = { name: restaurantName };

  const templateName = kind === "confirmed"
    ? creds.templates.confirmation
    : creds.templates.cancellation;
  const params = kind === "confirmed"
    ? confirmationParams(guestData, restaurant)
    : cancellationParams(guestData, restaurant);

  const result = await sendWhatsAppTemplate(creds, {
    to: reservation.phone,
    template: templateName,
    parameters: params,
  });

  if (!result.ok && !result.skipped) {
    console.warn(`[notifications] WhatsApp ${kind} failed:`, result.error);
  }
}
