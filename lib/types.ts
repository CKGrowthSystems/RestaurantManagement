export type TableShape = "round" | "square";
/**
 * Reservation-Quelle.
 *
 * Aktuell erlaubte neue Werte:
 *   - "Voice-KI"  → automatische Buchung via Voice-AI-Telefonbot
 *   - "Webseite"  → web-/chatbasiert (Webseite, Chat-Agent)
 *   - "Manuell"   → vom Team eingetragen (inkl. Walk-In)
 *
 * Historische Werte werden weiter unterstuetzt (HiSource mappt sie
 * auf die neuen Labels), sollten aber nicht mehr fuer neue Records
 * benutzt werden.
 */
export type ReservationSource =
  | "Voice-KI"
  | "Webseite"
  | "Manuell"
  // Legacy, read-only:
  | "Telefon"
  | "Chatagent"
  | "Walk-in"
  | "Walk-In"
  | "Web";
/**
 * Reservations-Status-Flow:
 *   - Angefragt   → wartet auf Freigabe durch Wirt (nur wenn Tisch requires_approval=true ist)
 *   - Bestätigt   → aktiv, Tisch ist gebucht
 *   - Eingetroffen → Gast sitzt
 *   - Abgeschlossen → Gast ist weg, Tisch frei
 *   - Storniert   → abgesagt (vom Gast oder Wirt)
 *   - No-Show     → nicht erschienen
 *
 * "Offen" ist Legacy (wurde bei MVP 2026-04-22 durch Angefragt ersetzt).
 */
export type ReservationStatus =
  | "Offen"
  | "Angefragt"
  | "Bestätigt"
  | "Eingetroffen"
  | "Abgeschlossen"
  | "No-Show"
  | "Storniert";
export type CallOutcome = "reservation" | "info" | "declined" | "failed";
export type ReleaseMode = "global" | "zone" | "table";

export interface Restaurant {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  locale: string;
  theme: string;
  logo_url: string | null;
}

export interface RoomPoint { x: number; y: number }

export interface Floor {
  id: string;
  restaurant_id: string;
  name: string;
  sort_order: number;
  room_width: number;
  room_height: number;
  entrance_x: number;
  entrance_y: number;
  entrance_w: number;
  entrance_h: number;
  room_polygon: RoomPoint[] | null;
}

export interface Zone {
  id: string;
  restaurant_id: string;
  floor_id: string | null;
  name: string;
  sort_order: number;
  release_minutes: number | null;
  bbox_x: number;
  bbox_y: number;
  bbox_w: number;
  bbox_h: number;
  polygon: RoomPoint[] | null; // relative to bbox_x/bbox_y; null = rectangle
  color: string | null;
}

export interface TableRow {
  id: string;
  restaurant_id: string;
  zone_id: string | null;
  label: string;
  seats: number;
  shape: TableShape;
  accessible: boolean;
  notes: string | null;
  pos_x: number;
  pos_y: number;
  rotation: number;
  release_minutes: number | null;
  /**
   * Wenn true, gehen AutoAssign-Platzierungen auf diesen Tisch als
   * „Angefragt" statt „Bestaetigt" rein. Der Wirt muss per Klick approven.
   * Typischer Use-Case: Stammtische.
   */
  requires_approval: boolean;
  /**
   * Optionaler Hinweis-Text, z.B. „Stammtisch Mueller Do 19-22".
   * Wird auf der Kanban-Karte angezeigt wenn die Reservierung
   * genau diesen Tisch getroffen hat.
   */
  approval_note: string | null;
}

export interface Reservation {
  id: string;
  restaurant_id: string;
  table_id: string | null;
  guest_name: string;
  phone: string | null;
  email: string | null;
  party_size: number;
  starts_at: string;
  duration_min: number;
  source: ReservationSource;
  status: ReservationStatus;
  note: string | null;
  auto_assigned: boolean;
  approval_reason: string | null;
  /**
   * Voice-freundliche 5-stellige Buchungsnummer pro Restaurant. Wird vom
   * Voice-KI-Agent am Ende des Anrufs angesagt und akzeptiert sie als
   * primaeren Identifier beim Storno-Anruf. Null fuer Walk-Ins und
   * Reservierungen aus der Zeit vor Migration 0009.
   */
  code: string | null;
  created_at: string;
}

export interface VoiceCall {
  id: string;
  restaurant_id: string;
  phone: string | null;
  started_at: string;
  duration_sec: number;
  outcome: CallOutcome;
  reservation_id: string | null;
  transcript: { speaker: "AI" | "Guest"; text: string }[];
}

export type VoiceEventKind = "error" | "warning" | "info";
export type VoiceEventSource = "mcp" | "rest" | "agent" | "system";

export interface VoiceEvent {
  id: string;
  restaurant_id: string;
  created_at: string;
  kind: VoiceEventKind;
  source: VoiceEventSource;
  tool: string | null;
  message: string;
  details: Record<string, unknown> | null;
  call_id: string | null;
  reservation_id: string | null;
}

export interface Branding {
  public_name: string | null;
  primary_color: string | null;
  accent_color: string | null;
  logo_url: string | null;
  powered_by: boolean;
}

export interface Notify {
  email: string | null;
  phone: string | null;
  on_reservation: boolean;
  on_approval_required: boolean;
  on_cancel: boolean;
  daily_digest: boolean;
}

export interface Settings {
  restaurant_id: string;
  release_mode: ReleaseMode;
  release_minutes: number;
  /**
   * Oeffnungszeiten pro Wochentag-Key (mo, tu, we, th, fr, sa, su).
   *
   * Akzeptiert zwei Formen (backwards-kompatibel):
   *   - Legacy: { open: "11:00", close: "22:00" }
   *   - Neu:    [{ open: "11:00", close: "14:00" }, { open: "17:00", close: "22:00" }]
   *
   * Ueber lib/opening-hours.ts -> normalizeOpeningSlots() immer in
   * Slot-Array umwandeln bevor man darauf rechnet.
   */
  opening_hours: Record<string, { open: string; close: string } | { open: string; close: string }[]>;
  voice_prompt: string | null;
  branding: Branding | null;
  notify: Notify | null;
  /**
   * Voice-AI-Kontext: Schliesstage, Sondertage, Ankuendigungen, Speisekarten/Allergen-PDFs,
   * Policies. Struktur siehe lib/calendar.ts (CalendarData).
   */
  calendar: import("./calendar").CalendarData | null;
  /**
   * Per-Tenant WhatsApp-Cloud-API-Konfiguration. Sensitive Felder
   * (access_token) werden in API-Responses redacted.
   */
  whatsapp: WhatsAppSettings | null;
  /**
   * Email-an-GAST-Konfiguration (separat von notify.email das ans Team geht).
   * Voice-AI fragt am Telefon nach E-Mail wenn dieser Kanal aktiv ist.
   */
  guest_email: GuestEmailSettings | null;
}

export interface GuestEmailSettings {
  enabled: boolean;
  send_on_confirmed: boolean;
  send_on_cancelled: boolean;
  send_reminder_hours_before: number;
  /** Vom Restaurant editierbare Greeting/Closing — gleiche Struktur wie WhatsApp */
  custom_messages?: {
    confirmed_greeting?: string;
    confirmed_closing?: string;
    cancelled_greeting?: string;
    cancelled_closing?: string;
    reminder_greeting?: string;
    reminder_closing?: string;
  };
}

export interface WhatsAppSettings {
  enabled: boolean;
  /**
   * Provider-Auswahl. Default „ghl" — der Hauptweg fuer SaaS-Skalierung
   * (Restaurant macht nur GHL-Workflow-Setup, kein Meta-Manager-Pain).
   * „meta" = direct an die Meta Cloud API (kostenlos, mehr Onboarding-
   * Aufwand pro Tenant).
   */
  provider?: "ghl" | "meta";
  /** GHL/LeadConnector Inbound-Webhook-URL (wenn provider = ghl) */
  ghl_webhook_url?: string | null;
  // Felder unten greifen nur wenn provider = "meta"
  phone_number_id: string | null;
  access_token: string | null;             // im UI nur als Indikator (set/unset)
  business_account_id?: string | null;
  send_on_confirmed: boolean;
  send_on_cancelled: boolean;
  send_reminder_hours_before: number;      // 0 = aus
  templates: {
    confirmation: string;
    cancellation: string;
    reminder: string;
  };
  /**
   * Vom Restaurant editierbare Begrueßung + Abschluss pro Nachrichtentyp.
   * Termindetails (Mitte) werden vom System gefuellt — fix damit der Gast
   * Datum/Tisch/Personen IMMER konsistent sieht.
   *
   * Variablen die der Restaurant-Inhaber nutzen kann:
   *   {name}        → Vorname / „Familie X" des Gasts
   *   {restaurant}  → Restaurant-Name (Branding-Public-Name)
   *   {code}        → Buchungsnummer
   *   {date}        → „Donnerstag, 25. April"
   *   {time}        → „19:30"
   *   {party}       → Personenzahl
   */
  custom_messages?: {
    confirmed_greeting?: string;
    confirmed_closing?: string;
    cancelled_greeting?: string;
    cancelled_closing?: string;
    reminder_greeting?: string;
    reminder_closing?: string;
  };
}

export interface AppUser {
  id: string;
  email: string;
  display_name: string;
  role: "owner" | "manager" | "staff";
  created_at: string;
  last_sign_in_at: string | null;
}
