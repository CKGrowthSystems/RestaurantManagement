/**
 * Bulletproof date/time parsing for voice-AI input.
 *
 * Accepts:
 *   - ISO-8601 with or without TZ: "2026-04-23T20:00:00+02:00" / "2026-04-23T20:00:00"
 *   - Natural German: "heute 20:00", "morgen 19 Uhr", "Donnerstag 19:30"
 *   - English: "today 20:00", "tomorrow 19:00"
 *   - Plain time (interpreted as today or tomorrow if already past)
 *
 * Fallback TZ: Europe/Berlin (CEST +02:00 summer, CET +01:00 winter).
 */

const DAY_KEYWORDS_DE: Record<string, number> = {
  montag: 1, dienstag: 2, mittwoch: 3, donnerstag: 4, freitag: 5, samstag: 6, sonntag: 0,
  mo: 1, di: 2, mi: 3, do: 4, fr: 5, sa: 6, so: 0,
  monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 0,
};

/** Berlin-time offset string for any given JS Date (handles DST). */
function berlinOffset(date: Date): string {
  // Europe/Berlin is UTC+1 (CET) or UTC+2 (CEST).
  // We check via Intl.DateTimeFormat with a known trick: format the date in Berlin,
  // then compare to UTC components to derive the offset.
  const utcMinutes = date.getUTCHours() * 60 + date.getUTCMinutes();
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(date);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const berlinMinutes = h * 60 + m;
  let diff = berlinMinutes - utcMinutes;
  // Handle day wrap
  if (diff < -720) diff += 1440;
  if (diff > 720) diff -= 1440;
  const sign = diff >= 0 ? "+" : "-";
  const abs = Math.abs(diff);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
}

export interface ParseResult {
  ok: boolean;
  iso?: string;            // normalised ISO-8601 with TZ
  berlinLocal?: string;    // "Donnerstag, 23. April um 20:00"
  warning?: string;        // "Datum lag in der Vergangenheit, auf morgen verschoben."
  error?: string;
}

export function parseStartsAt(input: string, referenceNow = new Date()): ParseResult {
  if (!input || typeof input !== "string") {
    return { ok: false, error: "starts_at fehlt oder ist kein String." };
  }
  const original = input.trim();
  const lower = original.toLowerCase();

  // Case 1: ISO-8601 with TZ — accept as-is.
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?([+-]\d{2}:?\d{2}|Z)$/i.test(original)) {
    const d = new Date(original);
    if (isNaN(d.getTime())) return { ok: false, error: "ISO-Datum konnte nicht geparst werden." };
    return resultFrom(d, referenceNow);
  }

  // Case 2: ISO-8601 without TZ — assume Berlin.
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(original)) {
    // Build a Date as if the input were UTC, then shift by Berlin offset
    const asUTC = new Date(original + "Z");
    if (isNaN(asUTC.getTime())) return { ok: false, error: "ISO-Datum konnte nicht geparst werden." };
    const offsetStr = berlinOffset(asUTC);
    const signed = offsetStr.startsWith("-");
    const [hh, mm] = offsetStr.slice(1).split(":").map(Number);
    const offsetMs = (hh * 60 + mm) * 60_000 * (signed ? 1 : -1);
    const actual = new Date(asUTC.getTime() + offsetMs);
    return resultFrom(actual, referenceNow);
  }

  // Case 3: Natural language — extract (day reference) + (time)
  const timeMatch = lower.match(/(\d{1,2})(?::|\s*uhr\s*(\d{2})?)?(\d{2})?/);
  const hour = timeMatch ? Number(timeMatch[1]) : null;
  const minute = timeMatch
    ? Number(timeMatch[3] ?? timeMatch[2] ?? 0)
    : null;

  if (hour == null || hour < 0 || hour > 24 || minute == null || minute > 59) {
    return { ok: false, error: "Uhrzeit konnte nicht erkannt werden. Bitte HH:MM oder 'HH Uhr' angeben." };
  }

  // Determine target date — anchored in BERLIN local time (not the runtime's local tz)
  // so "heute"/"morgen"/Wochentage are interpreted from the Berlin clock even when
  // the server runs in UTC (Vercel).
  const berlinParts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin",
    year: "numeric", month: "2-digit", day: "2-digit", weekday: "short",
  }).formatToParts(referenceNow);
  const bGet = (t: string) => berlinParts.find((p) => p.type === t)?.value ?? "";
  let year = Number(bGet("year"));
  let month = Number(bGet("month")); // 1-12
  let day = Number(bGet("day"));
  const wdShortToNum: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const todayWdBerlin = wdShortToNum[bGet("weekday")] ?? 0;

  let addedDays = 0;

  if (/\bheute\b|\btoday\b/.test(lower)) {
    // keep today
  } else if (/\bmorgen\b|\btomorrow\b/.test(lower)) {
    day += 1; addedDays = 1;
  } else if (/\b\u00fcbermorgen\b|\bday after tomorrow\b/.test(lower)) {
    day += 2; addedDays = 2;
  } else {
    // Look for weekday name
    let wd = -1;
    for (const [kw, v] of Object.entries(DAY_KEYWORDS_DE)) {
      if (new RegExp(`\\b${kw}\\b`, "i").test(lower)) { wd = v; break; }
    }
    if (wd >= 0) {
      let delta = (wd - todayWdBerlin + 7) % 7;
      if (delta === 0) delta = 7; // "am Montag" wenn heute Mo → naechster Mo
      day += delta;
      addedDays = delta;
    }
    // Check for explicit date like "22.04" or "22.04.2026" or "22 April"
    const dotMatch = lower.match(/(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?/);
    const textMonth = lower.match(/(\d{1,2})\s+(januar|februar|m\u00e4rz|maerz|april|mai|juni|juli|august|september|oktober|november|dezember)/i);
    if (dotMatch) {
      day = Number(dotMatch[1]);
      month = Number(dotMatch[2]);
      let y = dotMatch[3] ? Number(dotMatch[3]) : year;
      if (y < 100) y += 2000;
      year = y;
    } else if (textMonth) {
      const months = ["januar", "februar", "märz", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "dezember"];
      const d2 = Number(textMonth[1]);
      const monName = textMonth[2].toLowerCase().replace("maerz", "märz");
      const mon = months.indexOf(monName);
      if (mon >= 0) { month = mon + 1; day = d2; }
    }
  }

  // Normalise day-of-month overflow (e.g. April 33 -> May 3) using UTC math (pure arithmetic).
  const normalised = new Date(Date.UTC(year, month - 1, day));
  const ny = normalised.getUTCFullYear();
  const nm = normalised.getUTCMonth() + 1;
  const nd = normalised.getUTCDate();

  // Build a provisional Date at the Berlin wall-clock time via ISO + offset.
  // We need the offset that will APPLY on that target date (handles DST transitions).
  // First guess: offset of referenceNow. Then refine by re-checking at the constructed Date.
  const probeIso = `${ny}-${String(nm).padStart(2, "0")}-${String(nd).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+00:00`;
  const probe = new Date(probeIso);
  const offset = berlinOffset(probe);
  const iso = `${ny}-${String(nm).padStart(2, "0")}-${String(nd).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00${offset}`;
  const d = new Date(iso);
  return resultFrom(d, referenceNow, addedDays > 0 ? undefined : undefined);
}

function resultFrom(d: Date, referenceNow: Date, warning?: string): ParseResult {
  if (isNaN(d.getTime())) return { ok: false, error: "Datum konnte nicht geparst werden." };

  // If date is in the past by more than 15 min, shift to next day automatically
  const diffMinutes = (d.getTime() - referenceNow.getTime()) / 60_000;
  let final = d;
  let finalWarning = warning;
  if (diffMinutes < -15) {
    final = new Date(d.getTime() + 24 * 3600_000);
    finalWarning = "Zeitpunkt lag bereits in der Vergangenheit, wurde auf den naechsten Tag verschoben.";
  }

  // IMPORTANT: on UTC-based runtimes (Vercel), final.getHours() returns UTC hours.
  // Build the Berlin-local ISO via Intl.DateTimeFormat so the iso+offset pair is self-consistent.
  const offset = berlinOffset(final);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(final);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  // Intl may emit "24" for hour=00 in some locales; normalise.
  const hh = g("hour") === "24" ? "00" : g("hour");
  const iso = `${g("year")}-${g("month")}-${g("day")}T${hh}:${g("minute")}:${g("second")}${offset}`;

  const berlinLocal = new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    weekday: "long", day: "numeric", month: "long",
    hour: "2-digit", minute: "2-digit",
  }).format(final);

  return { ok: true, iso, berlinLocal, warning: finalWarning };
}

/** Short info block for voice-AI: current date + DoW + TZ. */
export function currentDateTimeInfo(now = new Date()) {
  const berlinNow = new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    weekday: "long", day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).format(now);
  const isoNow = now.toISOString();
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return {
    current_datetime_berlin: berlinNow,
    current_datetime_iso: isoNow,
    today_date: todayIso,
    timezone: "Europe/Berlin",
  };
}
