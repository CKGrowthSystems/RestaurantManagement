/**
 * WhatsApp-Template-Builder
 * ==========================
 *
 * Baut die Variablen-Arrays fuer die 3 Standard-Templates auf. Die Templates
 * SELBST muessen in Meta Business Manager angelegt + freigegeben werden.
 *
 * Empfohlene Template-Texte (CK GrowthSystems-Empfehlung — Pilot kann
 * davon abweichen, Variablen-Reihenfolge bleibt aber gleich):
 *
 * --- booking_confirmation_de (Category: UTILITY) ---
 *   Hallo {{1}}, vielen Dank fuer Ihre Reservierung im {{2}}!
 *   📅 {{3}}, {{4}} Uhr
 *   👥 {{5}} Personen
 *   📞 Buchungsnummer: {{6}}
 *
 *   Bei Aenderungen einfach diese Nummer zurueckrufen — Ihre
 *   Buchungsnummer hilft uns, Sie schnell zu finden. Wir freuen uns auf Sie!
 *
 * --- booking_cancellation_de (Category: UTILITY) ---
 *   Hallo {{1}}, Ihre Reservierung im {{2}} am {{3}} wurde storniert.
 *   Wir hoffen, Sie bald wieder bei uns begruessen zu duerfen!
 *
 * --- booking_reminder_de (Category: UTILITY) ---
 *   Hallo {{1}}, kurze Erinnerung — Ihre Reservierung im {{2}} ist heute
 *   um {{3}} Uhr fuer {{4}} Personen. Bis gleich!
 *
 * Variablen-Mapping (Reihenfolge ist BINDEND):
 *   confirmation:  [guest_first_name, restaurant_name, weekday_date, time_hhmm, party_size, code]
 *   cancellation:  [guest_first_name, restaurant_name, weekday_date_time]
 *   reminder:      [guest_first_name, restaurant_name, time_hhmm, party_size]
 */

export type GuestReservationData = {
  guest_name: string;
  party_size: number;
  starts_at: string;       // ISO
  code: string | null;
};

export type RestaurantData = {
  name: string;
};

function firstName(full: string): string {
  // "Familie Schmidt" / "Herr Mueller" → "Schmidt" / "Mueller"
  // "Max Mustermann" → "Max"
  // Fuer WhatsApp ist „Hallo Familie Schmidt" passender als „Hallo Familie",
  // also gibt es bei „Familie X" oder „Herr/Frau X" den letzten Teil zurueck.
  const trimmed = full.trim();
  const lower = trimmed.toLowerCase();
  if (lower.startsWith("familie ") || lower.startsWith("herr ") || lower.startsWith("frau ")) {
    return trimmed; // ganzes „Familie Schmidt" zurueckgeben
  }
  // sonst Vorname (erstes Wort)
  return trimmed.split(/\s+/)[0] || trimmed;
}

function fmtBerlinDate(iso: string): string {
  return new Date(iso).toLocaleDateString("de-DE", {
    weekday: "long", day: "numeric", month: "long",
    timeZone: "Europe/Berlin",
  });
}

function fmtBerlinTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("de-DE", {
    hour: "2-digit", minute: "2-digit",
    timeZone: "Europe/Berlin",
  });
}

function fmtBerlinDateTime(iso: string): string {
  return new Date(iso).toLocaleString("de-DE", {
    weekday: "long", day: "numeric", month: "long",
    hour: "2-digit", minute: "2-digit",
    timeZone: "Europe/Berlin",
  });
}

/**
 * Baut die Body-Parameters fuer das booking_confirmation-Template.
 * Mapping: [name, restaurant, date, time, partySize, code]
 */
export function confirmationParams(
  r: GuestReservationData,
  restaurant: RestaurantData,
): string[] {
  return [
    firstName(r.guest_name),
    restaurant.name,
    fmtBerlinDate(r.starts_at),
    fmtBerlinTime(r.starts_at),
    String(r.party_size),
    r.code ?? "—",
  ];
}

/**
 * Mapping: [name, restaurant, datetime]
 */
export function cancellationParams(
  r: GuestReservationData,
  restaurant: RestaurantData,
): string[] {
  return [
    firstName(r.guest_name),
    restaurant.name,
    fmtBerlinDateTime(r.starts_at),
  ];
}

/**
 * Mapping: [name, restaurant, time, partySize]
 */
export function reminderParams(
  r: GuestReservationData,
  restaurant: RestaurantData,
): string[] {
  return [
    firstName(r.guest_name),
    restaurant.name,
    fmtBerlinTime(r.starts_at),
    String(r.party_size),
  ];
}
