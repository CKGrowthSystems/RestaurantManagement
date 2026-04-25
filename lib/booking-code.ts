/**
 * Generierung der 5-stelligen Buchungsnummer pro Restaurant.
 *
 * Strategie:
 *   1. 10x Random aus [10000–99999] versuchen — bei < 1000 aktiven
 *      Reservierungen pro Restaurant ist die Kollisionsrate < 0.001 %.
 *   2. Falls alle 10 Versuche kollidieren (extrem unwahrscheinlich):
 *      sequenziell ab kleinster freier Nummer.
 *   3. Falls alle 90.000 Codes belegt: null zurueck und Aufrufer setzt
 *      code = null (Reservierung wird trotzdem angelegt, nur ohne Nummer).
 *
 * Race-Schutz: zusaetzlich liegt eine UNIQUE-Constraint auf
 * (restaurant_id, code) im DB-Schema — bei zwei parallelen Generatoren
 * mit demselben Code faengt Postgres die zweite Insert-Anfrage ab und
 * der Aufrufer kann erneut versuchen.
 */

const MIN = 10000;
const MAX = 99999;

export function randomCode(): string {
  return String(Math.floor(MIN + Math.random() * (MAX - MIN + 1)));
}

export async function generateUniqueBookingCode(
  supabase: any,
  restaurantId: string,
): Promise<string | null> {
  // 1. Random-Picks
  for (let i = 0; i < 10; i++) {
    const code = randomCode();
    const { count, error } = await supabase
      .from("reservations")
      .select("*", { count: "exact", head: true })
      .eq("restaurant_id", restaurantId)
      .eq("code", code);
    if (error) {
      // Wenn die Spalte noch nicht existiert (Migration nicht gelaufen),
      // einfach null zurueck — Reservierung wird trotzdem angelegt.
      return null;
    }
    if ((count ?? 0) === 0) return code;
  }

  // 2. Sequentieller Fallback
  const { data: used, error } = await supabase
    .from("reservations")
    .select("code")
    .eq("restaurant_id", restaurantId)
    .not("code", "is", null);
  if (error) return null;

  const usedSet = new Set((used ?? []).map((r: any) => r.code));
  for (let n = MIN; n <= MAX; n++) {
    const code = String(n);
    if (!usedSet.has(code)) return code;
  }

  // 3. Alle Codes belegt — sehr unwahrscheinlich
  return null;
}
