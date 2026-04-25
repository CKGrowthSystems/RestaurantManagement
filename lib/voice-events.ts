/**
 * Voice-Event-Logger
 * ===================
 *
 * Schreibt strukturierte Events ins voice_events-Log. Die /voice-Seite
 * abonniert die Tabelle live und zeigt Errors/Warnings/Infos in einem
 * Aktivitaets-Card an.
 *
 * Best-Effort: failt der Insert (z.B. Migration noch nicht eingespielt
 * oder DB nicht erreichbar), wird der Fehler in den Server-Log geschrieben
 * und das aufrufende Tool laeuft normal weiter — Logging darf nie eine
 * Voice-KI-Anfrage blockieren.
 */

import { createAdminClient } from "@/lib/supabase/server";
import type { VoiceEventKind, VoiceEventSource } from "@/lib/types";

export type LogVoiceEventInput = {
  restaurantId: string;
  kind?: VoiceEventKind;            // default 'error'
  source: VoiceEventSource;
  tool?: string | null;
  message: string;
  details?: unknown;
  callId?: string | null;
  reservationId?: string | null;
};

export async function logVoiceEvent(input: LogVoiceEventInput): Promise<void> {
  // Synchrones Best-Effort-Insert. Wir warten NICHT auf Result-Konsistenz
  // im Tool-Pfad — Aufrufer fire-and-forget mit `void logVoiceEvent(...)`.
  try {
    const admin = createAdminClient();
    const detailsJson =
      input.details === undefined ? null
      : input.details === null ? null
      : (typeof input.details === "object"
          ? input.details
          : { value: input.details });

    const { error } = await admin.from("voice_events").insert({
      restaurant_id: input.restaurantId,
      kind: input.kind ?? "error",
      source: input.source,
      tool: input.tool ?? null,
      message: input.message.slice(0, 1000),
      details: detailsJson,
      call_id: input.callId ?? null,
      reservation_id: input.reservationId ?? null,
    });
    if (error) {
      // Migration evtl. noch nicht eingespielt → einfach nur loggen.
      console.warn("[voice-events] insert failed:", error.message);
    }
  } catch (err) {
    console.warn("[voice-events] unexpected error:", err);
  }
}

/**
 * Fire-and-forget Variante: schluckt alle Errors, gibt void zurueck —
 * passt fuer await-freien Aufruf an Stellen wo das Logging nicht den
 * Request blockieren darf.
 */
export function logVoiceEventAsync(input: LogVoiceEventInput): void {
  void logVoiceEvent(input);
}
