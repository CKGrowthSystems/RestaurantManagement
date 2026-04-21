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

export interface Settings {
  restaurant_id: string;
  release_mode: ReleaseMode;
  release_minutes: number;
  opening_hours: Record<string, { open: string; close: string }>;
  voice_prompt: string | null;
}
