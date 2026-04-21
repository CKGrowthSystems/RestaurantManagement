export type TableShape = "round" | "square";
export type ReservationSource = "Voice-KI" | "Telefon" | "Walk-in" | "Web";
export type ReservationStatus =
  | "Offen"
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
  opening_hours: Record<string, { open: string; close: string }>;
  voice_prompt: string | null;
  branding: Branding | null;
  notify: Notify | null;
}

export interface AppUser {
  id: string;
  email: string;
  display_name: string;
  role: "owner" | "manager" | "staff";
  created_at: string;
  last_sign_in_at: string | null;
}
