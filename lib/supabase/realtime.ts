"use client";
import { useEffect, useRef, useState } from "react";
import { createClient } from "./browser";

/** Generisches Real-time-Array fuer eine Supabase-Tabelle.
 *  Initial-Daten kommen vom Server (Hydration), Updates ueber Postgres-Changes.
 *  - Filter via `restaurantIdFilter` (RLS und Publication sollten bereits passen;
 *    der explizite Filter reduziert Netz-Traffic pro Client).
 *  - getId: stabiler Key.
 *
 *  INSERT -> prepend. UPDATE -> ersetzen. DELETE -> entfernen.
 */
export function useRealtimeList<T extends { id: string }>(
  table: string,
  restaurantId: string | null,
  initial: T[],
  opts?: {
    getId?: (row: T) => string;
    orderDesc?: (row: T) => string | number;
    onInsert?: (row: T) => boolean; // return true to keep
  }
): [T[], React.Dispatch<React.SetStateAction<T[]>>] {
  const [items, setItems] = useState<T[]>(initial);

  // Sync wenn Server-Initial sich aendert (nach router.refresh() oder Navigation)
  useEffect(() => {
    setItems(initial);
  }, [initial]);

  const getId = opts?.getId ?? ((r: T) => r.id);
  const keepInsert = opts?.onInsert ?? (() => true);
  const onInsertRef = useRef(keepInsert);
  onInsertRef.current = keepInsert;

  useEffect(() => {
    if (!restaurantId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`rt-${table}-${restaurantId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        (payload: any) => {
          const evt = payload.eventType;
          if (evt === "INSERT") {
            const row = payload.new as T;
            if (!onInsertRef.current(row)) return;
            setItems((prev) => {
              // Duplikate verhindern
              if (prev.some((r) => getId(r) === getId(row))) return prev;
              return [row, ...prev];
            });
          } else if (evt === "UPDATE") {
            const row = payload.new as T;
            setItems((prev) => prev.map((r) => (getId(r) === getId(row) ? row : r)));
          } else if (evt === "DELETE") {
            const oldRow = payload.old as T;
            setItems((prev) => prev.filter((r) => getId(r) !== getId(oldRow)));
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, restaurantId]);

  return [items, setItems];
}
