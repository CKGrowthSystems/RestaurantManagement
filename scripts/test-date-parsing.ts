/**
 * Sanity test for lib/date-parsing after the TZ fix.
 * Simulates Vercel's UTC runtime by using `TZ=UTC node …`.
 */
import { parseStartsAt, currentDateTimeInfo } from "../lib/date-parsing";

const cases: { desc: string; input: string; refNow: string; expectBerlin: string }[] = [
  {
    desc: "natural 'morgen 20 Uhr' (ref Tue 19:14 Berlin)",
    input: "morgen 20 Uhr",
    refNow: "2026-04-21T17:14:00Z", // = Tue 19:14 Berlin
    expectBerlin: "20:00", // Wed 22 Apr 20:00 Berlin
  },
  {
    desc: "weekday 'Donnerstag 19:30' (ref Tue 19:14 Berlin)",
    input: "Donnerstag 19:30",
    refNow: "2026-04-21T17:14:00Z",
    expectBerlin: "19:30",
  },
  {
    desc: "ISO with +02:00",
    input: "2026-04-23T20:00:00+02:00",
    refNow: "2026-04-21T17:14:00Z",
    expectBerlin: "20:00",
  },
  {
    desc: "ISO without TZ (assume Berlin)",
    input: "2026-04-23T19:00:00",
    refNow: "2026-04-21T17:14:00Z",
    expectBerlin: "19:00",
  },
  {
    desc: "Berlin-midnight boundary (ref 22:30 UTC = 00:30 Berlin Wed)",
    input: "Donnerstag 20 Uhr",
    refNow: "2026-04-21T22:30:00Z", // Wed 00:30 Berlin
    expectBerlin: "20:00",
  },
  {
    desc: "Past time auto-shift (ref Tue 19:14, ask for 'heute 12 Uhr' → morgen)",
    input: "heute 12:00",
    refNow: "2026-04-21T17:14:00Z",
    expectBerlin: "12:00",
  },
];

let fails = 0;
console.log("Current date/time info:", currentDateTimeInfo());
console.log("---");

for (const c of cases) {
  const res = parseStartsAt(c.input, new Date(c.refNow));
  const reparsed = res.iso ? new Date(res.iso) : null;
  const berlinFmt = reparsed
    ? new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit", hour12: false }).format(reparsed)
    : "n/a";
  const ok = res.ok && berlinFmt === c.expectBerlin;
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"} | ${c.desc}`);
  console.log(`     input=${c.input}`);
  console.log(`     iso=${res.iso}`);
  console.log(`     parsed_date=${res.berlinLocal}`);
  console.log(`     berlin_hh:mm=${berlinFmt} (expected ${c.expectBerlin})`);
  if (res.warning) console.log(`     warning=${res.warning}`);
  console.log();
}

console.log(fails === 0 ? "✅ All tests passed" : `❌ ${fails} failing`);
process.exit(fails === 0 ? 0 : 1);
