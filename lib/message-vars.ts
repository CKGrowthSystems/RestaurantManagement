/**
 * Message-Variable-Substitution
 * ==============================
 *
 * Ersetzt Platzhalter wie {name}, {date}, {time} etc. in den vom Restaurant
 * editierten Texten (Begruessung + Abschluss). Genau diese Variablen sind
 * im Settings-UI dokumentiert.
 *
 * Unbekannte Variablen werden als Klartext belassen (z.B. ein Tippfehler
 * "{guast}" bleibt drin — der Restaurant-Inhaber sieht das im Test-Send
 * sofort und kann's korrigieren).
 */

export type MessageVars = {
  name: string;             // guest_first_name (parsed)
  restaurant: string;       // restaurant_name (branding-public-name)
  code: string;             // booking code
  date: string;             // formatted German date
  time: string;             // formatted German time
  party: number;            // party_size
};

const PLACEHOLDER_RE = /\{(name|restaurant|code|date|time|party)\}/g;

/**
 * Substituiert {name}/{restaurant}/{code}/{date}/{time}/{party} in einem
 * Text. Liefert Klartext zurueck — keine HTML-Escaping (WhatsApp ist plain).
 */
export function substituteVars(text: string, vars: MessageVars): string {
  if (!text) return "";
  return text.replace(PLACEHOLDER_RE, (_, key: keyof MessageVars) => {
    const v = vars[key];
    return v == null ? "" : String(v);
  });
}

/**
 * Standard-Default-Texte — werden genutzt wenn das Restaurant noch nichts
 * eigenes hinterlegt hat. Tonalitaet: warm, professionell, kein Marketing-
 * Sprech.
 */
export const DEFAULT_CUSTOM_MESSAGES = {
  confirmed_greeting: "Hallo {name}, vielen Dank für Ihre Reservierung im {restaurant}!",
  confirmed_closing: "Wir freuen uns auf Sie. Bei Änderungen einfach diese Nummer zurückrufen — Buchungsnr. {code} hilft uns, Sie schnell zu finden.",
  cancelled_greeting: "Hallo {name},",
  cancelled_closing: "Wir hoffen, Sie bald wieder bei uns begrüßen zu dürfen!",
  reminder_greeting: "Hallo {name}, kurze Erinnerung:",
  reminder_closing: "Bis später!",
} as const;

/**
 * Fix-formatierter Termindetails-Block — IMMER konsistent, kann das
 * Restaurant nicht aendern. Stellt sicher dass Datum/Zeit/Personen/Code
 * immer gleich aussehen, egal welcher Tenant.
 */
export function buildFixedDetails(
  kind: "confirmed" | "cancelled" | "reminder",
  vars: MessageVars,
): string {
  if (kind === "confirmed") {
    return [
      `📅 ${vars.date}, ${vars.time} Uhr`,
      `👥 ${vars.party} ${vars.party === 1 ? "Person" : "Personen"}`,
      vars.code ? `🔖 Buchungsnummer: ${vars.code}` : null,
    ].filter(Boolean).join("\n");
  }
  if (kind === "cancelled") {
    return `Ihre Reservierung am ${vars.date} um ${vars.time} Uhr wurde storniert.`;
  }
  // reminder
  return `📅 Heute um ${vars.time} Uhr · 👥 ${vars.party} ${vars.party === 1 ? "Person" : "Personen"}`;
}

/**
 * Komponiert die finale Nachricht aus Greeting + Fixed-Details + Closing.
 * Diese drei Teile werden in der Reihenfolge zusammengesetzt mit Leerzeilen.
 */
export function composeMessage(
  kind: "confirmed" | "cancelled" | "reminder",
  vars: MessageVars,
  custom: WhatsAppSettings["custom_messages"] | null | undefined,
): { greeting: string; details: string; closing: string; full: string } {
  const greetingTpl =
    (kind === "confirmed" && custom?.confirmed_greeting) ||
    (kind === "cancelled" && custom?.cancelled_greeting) ||
    (kind === "reminder" && custom?.reminder_greeting) ||
    DEFAULT_CUSTOM_MESSAGES[`${kind}_greeting` as const];
  const closingTpl =
    (kind === "confirmed" && custom?.confirmed_closing) ||
    (kind === "cancelled" && custom?.cancelled_closing) ||
    (kind === "reminder" && custom?.reminder_closing) ||
    DEFAULT_CUSTOM_MESSAGES[`${kind}_closing` as const];

  const greeting = substituteVars(greetingTpl, vars);
  const details = buildFixedDetails(kind, vars);
  const closing = substituteVars(closingTpl, vars);

  return {
    greeting,
    details,
    closing,
    full: [greeting, details, closing].filter(Boolean).join("\n\n"),
  };
}

// Re-import-loop avoidance: WhatsAppSettings hier locker getypt.
type WhatsAppSettings = {
  custom_messages?: {
    confirmed_greeting?: string;
    confirmed_closing?: string;
    cancelled_greeting?: string;
    cancelled_closing?: string;
    reminder_greeting?: string;
    reminder_closing?: string;
  };
};
