/**
 * In-memory data store used when Supabase env vars are unset (preview mode).
 */

import { randomUUID } from "node:crypto";
import type { Floor, Reservation, Restaurant, Settings, TableRow, VoiceCall, Zone } from "./types";

type Row = Record<string, unknown>;

const RESTAURANT_ID = "demo-restaurant";

interface Store {
  restaurants: Restaurant[];
  memberships: Row[];
  floors: Floor[];
  zones: Zone[];
  tables: TableRow[];
  reservations: Reservation[];
  voice_calls: VoiceCall[];
  settings: Settings[];
  webhook_log: Row[];
}

let _store: Store | null = null;

function seed(): Store {
  const floors: Floor[] = [
    { id: "f-eg", restaurant_id: RESTAURANT_ID, name: "Erdgeschoss", sort_order: 0,
      room_width: 940, room_height: 480, entrance_x: 600, entrance_y: 440, entrance_w: 60, entrance_h: 20,
      room_polygon: null },
    { id: "f-og", restaurant_id: RESTAURANT_ID, name: "Obergeschoss", sort_order: 1,
      room_width: 700, room_height: 420, entrance_x: 40,  entrance_y: 200, entrance_w: 20, entrance_h: 60,
      room_polygon: null },
  ];
  const zones: Zone[] = [
    { id: "z-innen",    restaurant_id: RESTAURANT_ID, floor_id: "f-eg", name: "Innenraum", sort_order: 0, release_minutes: null, bbox_x:  20, bbox_y: 60, bbox_w: 360, bbox_h: 360, color: null },
    { id: "z-fenster",  restaurant_id: RESTAURANT_ID, floor_id: "f-eg", name: "Fenster",   sort_order: 1, release_minutes: null, bbox_x: 400, bbox_y: 60, bbox_w: 180, bbox_h: 360, color: null },
    { id: "z-terrasse", restaurant_id: RESTAURANT_ID, floor_id: "f-eg", name: "Terrasse",  sort_order: 2, release_minutes: null, bbox_x: 600, bbox_y: 60, bbox_w: 300, bbox_h: 360, color: null },
    { id: "z-loft",     restaurant_id: RESTAURANT_ID, floor_id: "f-og", name: "Loft",      sort_order: 0, release_minutes: null, bbox_x:  80, bbox_y: 60, bbox_w: 540, bbox_h: 300, color: null },
  ];
  const tables: TableRow[] = [
    mk("T1", "z-innen",    2, "round",  false, "Fensterplatz",    60,  110),
    mk("T2", "z-innen",    4, "round",  false, null,             160,  100),
    mk("T3", "z-innen",    2, "round",  false, null,             270,  110),
    mk("T4", "z-innen",    4, "square", true,  "Rollstuhlgerecht", 60, 220),
    mk("T5", "z-innen",    6, "square", false, null,             170,  220),
    mk("T6", "z-innen",    2, "round",  false, null,             290,  220),
    mk("T7", "z-innen",    8, "square", true,  "Familientisch",  100,  330),
    mk("T8", "z-innen",    4, "round",  false, null,             260,  330),
    mk("F1", "z-fenster",  2, "square", false, null,              90,   90),
    mk("F2", "z-fenster",  2, "square", false, null,              90,  180),
    mk("F3", "z-fenster",  4, "square", false, null,              90,  270),
    mk("A1", "z-terrasse", 4, "round",  false, "Raucher",         70,   90),
    mk("A2", "z-terrasse", 4, "round",  false, null,             200,   90),
    mk("A3", "z-terrasse", 6, "round",  true,  null,              70,  200),
    mk("A4", "z-terrasse", 4, "round",  false, null,             200,  200),
    mk("A5", "z-terrasse", 2, "square", false, null,              70,  310),
    mk("A6", "z-terrasse", 2, "square", false, null,             200,  310),
    mk("L1", "z-loft",     4, "round",  false, "Ruhiger Bereich",  80,   90),
    mk("L2", "z-loft",     6, "square", false, null,              260,   90),
    mk("L3", "z-loft",     2, "round",  false, null,              440,   90),
    mk("L4", "z-loft",     8, "square", true,  "Event-Tisch",     180,  210),
  ];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const at = (h: number, m = 0) => { const d = new Date(today); d.setHours(h, m, 0, 0); return d.toISOString(); };

  const reservations: Reservation[] = [
    rsv("Familie Dimitriou", 4, at(19, 30), "Voice-KI", "Offen",         null,    "Terrasse bevorzugt · Kinderstuhl", true, "Größerer Tisch zugewiesen – bitte bestätigen"),
    rsv("Herr Voss",          2, at(20, 15), "Voice-KI", "Offen",         "t-T3",  "Allergien: Nüsse",                 false, null),
    rsv("Büro Papanikolaou",  8, at(21, 0 ), "Telefon",  "Offen",         "t-T7",  "Geburtstagskuchen",                false, null),
    rsv("Familie Weber",      6, at(19, 0 ), "Telefon",  "Bestätigt",     "t-T2",  "",                                 false, null),
    rsv("Papadopoulos",       4, at(19, 15), "Voice-KI", "Bestätigt",     "t-A4",  "Stammgast",                        false, null),
    rsv("Koutsou",            2, at(19, 30), "Voice-KI", "Bestätigt",     "t-T6",  "",                                 false, null),
    rsv("Müller",             3, at(20, 0 ), "Web",      "Bestätigt",     "t-T8",  "",                                 true,  "Größerer Tisch zugewiesen – bitte bestätigen"),
    rsv("Schwarz",            2, at(20, 30), "Web",      "Bestätigt",     "t-F2",  "",                                 false, null),
    rsv("Schneider",          4, at(18, 0 ), "Web",      "Eingetroffen",  "t-T4",  "Seit 78 Min.",                     false, null),
    rsv("Fischer",            2, at(18, 30), "Telefon",  "Eingetroffen",  "t-T1",  "Seit 48 Min.",                     false, null),
    rsv("Ioannidis",          4, at(18, 45), "Voice-KI", "Eingetroffen",  "t-A1",  "Seit 33 Min.",                     false, null),
    rsv("Bauer",              3, at(17, 0 ), "Walk-in",  "Abgeschlossen", "t-T3",  "",                                 true,  "Größerer Tisch zugewiesen"),
    rsv("Lehmann",            2, at(17, 30), "Web",      "Abgeschlossen", "t-F1",  "",                                 false, null),
  ];

  const voice_calls: VoiceCall[] = [
    vc(at(18, 14), "+49 171 ••• 4412", 154, "reservation", [
      ["AI",    "Rhodos Ohlsbach, guten Abend. Wie kann ich Ihnen helfen?"],
      ["Guest", "Hallo, ich hätte gerne einen Tisch für Donnerstag, 19:30, für vier Personen."],
      ["AI",    "Gerne. Innen oder auf der Terrasse?"],
      ["Guest", "Terrasse wäre schön."],
      ["AI",    "Moment, ich prüfe … Donnerstag 19:30, Tisch für vier auf der Terrasse ist verfügbar. Auf welchen Namen?"],
      ["Guest", "Dimitriou."],
      ["AI",    "Perfekt. Ich habe Sie für Donnerstag 19:30, vier Personen auf der Terrasse notiert."],
    ]),
    vc(at(17, 52), "+49 160 ••• 8820", 108, "reservation", []),
    vc(at(17, 30), "+49 160 ••• 3310",  42, "info",       []),
    vc(at(16, 55), "+49 172 ••• 1055", 128, "reservation", []),
    vc(at(16, 22), "+49 172 ••• 1918",  12, "declined",    []),
    vc(at(15, 44), "+49 162 ••• 7711",  88, "reservation", []),
    vc(at(14,  2), "+49 176 ••• 4456", 195, "reservation", []),
  ];

  const settings: Settings[] = [{
    restaurant_id: RESTAURANT_ID,
    release_mode: "global", release_minutes: 15,
    opening_hours: {
      mo: { open: "17:00", close: "23:00" }, tu: { open: "17:00", close: "23:00" },
      we: { open: "17:00", close: "23:00" }, th: { open: "17:00", close: "23:00" },
      fr: { open: "17:00", close: "23:30" }, sa: { open: "12:00", close: "23:30" },
      su: { open: "12:00", close: "22:00" },
    },
    voice_prompt: "Du bist die Gastgeberin von Rhodos Ohlsbach. Antworte herzlich und präzise auf Deutsch.",
    branding: null,
    notify: null,
  }];

  const restaurants: Restaurant[] = [{
    id: RESTAURANT_ID, name: "Rhodos Ohlsbach", slug: "rhodos-ohlsbach",
    timezone: "Europe/Berlin", locale: "de-DE", theme: "default",
    logo_url: null,
  }];

  return {
    restaurants,
    memberships: [{ user_id: "demo-user", restaurant_id: RESTAURANT_ID, role: "owner", display_name: "Giorgos A." }],
    floors, zones, tables, reservations, voice_calls, settings, webhook_log: [],
  };

  function mk(label: string, zone_id: string, seats: number, shape: "round" | "square",
              accessible: boolean, notes: string | null, pos_x: number, pos_y: number): TableRow {
    return { id: `t-${label}`, restaurant_id: RESTAURANT_ID, zone_id,
             label, seats, shape, accessible, notes, pos_x, pos_y, rotation: 0, release_minutes: null };
  }
  function rsv(guest_name: string, party_size: number, starts_at: string,
               source: Reservation["source"], status: Reservation["status"],
               table_id: string | null, note: string,
               auto_assigned: boolean, approval_reason: string | null): Reservation {
    return {
      id: randomUUID(), restaurant_id: RESTAURANT_ID, table_id,
      guest_name, party_size, starts_at, duration_min: 90, source, status, note,
      phone: null, email: null, auto_assigned, approval_reason,
      created_at: new Date().toISOString(),
    };
  }
  function vc(started_at: string, phone: string, duration_sec: number,
              outcome: VoiceCall["outcome"], lines: [string, string][]): VoiceCall {
    return {
      id: randomUUID(), restaurant_id: RESTAURANT_ID, phone, started_at,
      duration_sec, outcome, reservation_id: null,
      transcript: lines.map(([speaker, text]) => ({ speaker: speaker as "AI" | "Guest", text })),
    };
  }
}

export function getStore(): Store {
  if (!_store) _store = seed();
  return _store;
}

export const DEMO_RESTAURANT_ID = RESTAURANT_ID;
