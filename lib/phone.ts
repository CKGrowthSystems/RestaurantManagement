/**
 * Robuste Telefonnummer-Normalisierung fuer Voice-KI-Matching.
 *
 * Problem: Eine Reservierung kann mit „+49 176 64973716" gespeichert werden,
 * aber der Stornierungs-Anrufer sagt „null eins sieben sechs ...". GHL passt
 * das in „01766497..." um. Ein einfacher .eq("phone", x) findet das nicht.
 *
 * Loesung: Beide Seiten auf reine Ziffern reduzieren, deutsche Vorwahl
 * normalisieren, und beim Vergleich auch die letzten 9 Ziffern als
 * Fallback-Match akzeptieren (deckt deutsche Mobilnummern komplett ab).
 */

export function normalizePhone(p: string | null | undefined): string {
  if (!p) return "";
  let d = p.replace(/\D/g, "");
  // 0049 (international mit doppelter 0) → wegnehmen
  if (d.startsWith("0049")) d = d.slice(4);
  // 49 (Laendercode ohne Plus) → wegnehmen, wenn die Restlaenge plausibel ist
  else if (d.startsWith("49") && d.length >= 11) d = d.slice(2);
  // Fuehrende 0 (deutsche Vorwahl-Vorsilbe) → wegnehmen
  if (d.startsWith("0")) d = d.slice(1);
  return d;
}

/**
 * Prueft ob zwei Telefonnummern in unterschiedlichen Formaten zur selben
 * Person gehoeren. Nutzt normalisierte Form + Last-9-Digit-Fallback.
 */
export function phonesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizePhone(a);
  const nb = normalizePhone(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  // Last-9-Digits-Fallback fuer den Fall dass irgendwo 0 oder 49 anders gehandhabt wurde
  const tailA = na.slice(-9);
  const tailB = nb.slice(-9);
  return tailA.length >= 7 && tailA === tailB;
}
