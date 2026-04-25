/**
 * Calendar / Voice-AI-Context Helper.
 *
 * Datenmodell von settings.calendar:
 * {
 *   closures: [{ id, from, to, reason, ai_message?, blocks_booking? }],
 *   special_hours: [{ id, date, slots: [{open, close}], note? }],
 *   announcements: [{ id, message, active_from?, active_until? }],
 *   menu: { pdf_url, pdf_filename, extracted_text, char_count, uploaded_at },
 *   allergens: { pdf_url, pdf_filename, extracted_text, char_count, uploaded_at },
 *   policies: { allergies?, kids?, groups?, dress_code? },
 *   menu_highlights: ["..."]
 * }
 *
 * Alle Datums-Felder sind ISO-Datum-Strings „YYYY-MM-DD" (Berlin-lokal),
 * damit Vergleiche per `string compare` funktionieren ohne Date-Objekte.
 */

import type { OpeningSlot } from "./opening-hours";

export interface Closure {
  id: string;
  from: string;        // YYYY-MM-DD
  to: string;          // YYYY-MM-DD
  reason: string;
  ai_message?: string | null;
  /** true = AutoAssign + check_availability lehnen ab; false = nur Hinweis. Default true. */
  blocks_booking?: boolean;
}

export interface SpecialDay {
  id: string;
  date: string;        // YYYY-MM-DD
  slots: OpeningSlot[];
  note?: string | null;
}

export interface Announcement {
  id: string;
  message: string;
  active_from?: string | null;   // YYYY-MM-DD
  active_until?: string | null;  // YYYY-MM-DD
}

export interface DocumentRef {
  pdf_url?: string | null;
  pdf_filename?: string | null;
  extracted_text?: string | null;
  /** Optional manueller Text-Override falls PDF-Extraction Mist ist. */
  manual_text?: string | null;
  char_count?: number;
  uploaded_at?: string;
}

export interface Policies {
  allergies?: string | null;
  kids?: string | null;
  groups?: string | null;
  dress_code?: string | null;
}

export interface CalendarData {
  closures?: Closure[];
  special_hours?: SpecialDay[];
  announcements?: Announcement[];
  menu?: DocumentRef;
  allergens?: DocumentRef;
  policies?: Policies;
  menu_highlights?: string[];
}

/** Heute in Berlin als „YYYY-MM-DD". */
export function todayBerlinISO(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${g("year")}-${g("month")}-${g("day")}`;
}

/** Konvertiert ein Date-Objekt in „YYYY-MM-DD" Berlin-lokal. */
export function dateToBerlinISO(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(d);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${g("year")}-${g("month")}-${g("day")}`;
}

/** Liefert den Closure der ein Datum betrifft, oder null. */
export function isClosureForDate(calendar: CalendarData | null | undefined, dateISO: string): Closure | null {
  const closures = calendar?.closures ?? [];
  for (const c of closures) {
    if (dateISO >= c.from && dateISO <= c.to) return c;
  }
  return null;
}

/** Liefert die Sonderoeffnungszeiten fuer ein Datum, oder null. */
export function getSpecialHoursForDate(calendar: CalendarData | null | undefined, dateISO: string): SpecialDay | null {
  return (calendar?.special_hours ?? []).find((s) => s.date === dateISO) ?? null;
}

/** Filtert Ankuendigungen die heute aktiv sind. */
export function getActiveAnnouncements(calendar: CalendarData | null | undefined, dateISO: string): Announcement[] {
  const ann = calendar?.announcements ?? [];
  return ann.filter((a) => {
    if (a.active_from && dateISO < a.active_from) return false;
    if (a.active_until && dateISO > a.active_until) return false;
    return true;
  });
}

/** Liefert die naechsten N kommenden oder aktuellen Closures (sortiert). */
export function getUpcomingClosures(calendar: CalendarData | null | undefined, dateISO: string, limit = 3): Closure[] {
  return (calendar?.closures ?? [])
    .filter((c) => c.to >= dateISO)
    .sort((a, b) => a.from.localeCompare(b.from))
    .slice(0, limit);
}

/** Bevorzugt manuellen Override-Text, sonst extrahierten Text. */
export function getDocumentText(doc: DocumentRef | undefined): string | null {
  if (!doc) return null;
  const manual = doc.manual_text?.trim();
  if (manual) return manual;
  const extracted = doc.extracted_text?.trim();
  if (extracted) return extracted;
  return null;
}

/** Generiert eine kurze ID fuer neue Calendar-Eintraege. */
export function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}
