-- 0006_zone_polygon.sql
-- Verschiebt die Polygon-Funktion von Raum (floors.room_polygon) auf Bereich (zones.polygon).
-- floors.room_polygon bleibt als Spalte bestehen (bereits existierende Daten nicht loeschen,
-- Code ignoriert den Wert jetzt).
-- Idempotent: safe to run multiple times.

alter table if exists zones
  add column if not exists polygon jsonb; -- array of {x,y} points relative to bbox_x/bbox_y. null = rectangle fallback
