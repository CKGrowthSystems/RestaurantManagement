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

  // Notify-Toggle pruefen
  const notifyCfg = s.notify ?? null;
  const recipientEmail = notifyCfg?.email?.trim();
  if (!recipientEmail) return;

  const enabled = (
    (kind === "confirmed" && notifyCfg?.on_reservation) ||
    (kind === "approval_required" && notifyCfg?.on_approval_required) ||
    (kind === "cancelled" && notifyCfg?.on_cancel)
  );
  if (!enabled) return;

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
