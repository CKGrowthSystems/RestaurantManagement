/**
 * Oeffnungszeiten-Helpers.
 *
 * Format pro Wochentag (im DB-Feld settings.opening_hours):
 *   - LEGACY: { open: "11:00", close: "22:00" }
 *   - NEU:    [{ open: "11:00", close: "14:00" }, { open: "17:00", close: "22:00" }]
 *
 * Beide Formen werden gelesen, geschrieben wird ab jetzt nur noch als Array.
 * Mehrere Slots ermoeglichen Mittagspausen, Brunch-Sonntag, etc.
 */

export type OpeningSlot = { open: string; close: string };

const TIME_RE = /^\d{1,2}:\d{2}$/;

/** Normalisiert ein Tages-Eintrag (alt oder neu) auf ein Slot-Array. */
export function normalizeOpeningSlots(day: unknown): OpeningSlot[] {
  if (!day) return [];

  // Neu: Array
  if (Array.isArray(day)) {
    return day
      .filter((s): s is OpeningSlot =>
        !!s && typeof s === "object" &&
        typeof (s as any).open === "string" && typeof (s as any).close === "string" &&
        TIME_RE.test((s as any).open) && TIME_RE.test((s as any).close)
      )
      .map((s) => ({ open: s.open, close: s.close }));
  }

  // Legacy: einzelnes Objekt { open, close }
  if (typeof day === "object" && day !== null) {
    const obj = day as any;
    if (typeof obj.open === "string" && typeof obj.close === "string" &&
        TIME_RE.test(obj.open) && TIME_RE.test(obj.close)) {
      return [{ open: obj.open, close: obj.close }];
    }
  }

  return [];
}

/** Pruefen ob ein Zeitpunkt (hh:mm) in einem der Slots liegt. */
export function isOpenAt(slots: OpeningSlot[], hh: number, mm: number): boolean {
  const nowMin = hh * 60 + mm;
  return slots.some((s) => {
    const [oh, om] = s.open.split(":").map(Number);
    const [ch, cm] = s.close.split(":").map(Number);
    return nowMin >= oh * 60 + om && nowMin <= ch * 60 + cm;
  });
}

/** Mensch-lesbare Form, z.B. „11:00 bis 14:00 und 17:00 bis 22:00". */
export function formatSlotsHuman(slots: OpeningSlot[]): string {
  if (slots.length === 0) return "geschlossen";
  return slots.map((s) => `${s.open} bis ${s.close}`).join(" und ");
}
