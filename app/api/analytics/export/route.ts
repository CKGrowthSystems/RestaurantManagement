import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";

export const dynamic = "force-dynamic";

/**
 * GET /api/analytics/export?period=today|week|month&from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Streamt eine CSV-Datei mit allen Reservierungen der Periode. UTF-8 mit BOM
 * damit Excel die Umlaute beim direkten Doppelklick korrekt erkennt.
 */
export async function GET(request: Request) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const url = new URL(request.url);
  const period = url.searchParams.get("period") ?? "week";
  const customFrom = url.searchParams.get("from");
  const customTo = url.searchParams.get("to");

  const { from, to, label } = computeRange(period, customFrom, customTo);

  const [{ data: reservations }, { data: tables }, { data: zones }] = await Promise.all([
    ctx.supabase.from("reservations").select("*")
      .eq("restaurant_id", ctx.restaurantId)
      .gte("starts_at", from.toISOString())
      .lt("starts_at", to.toISOString())
      .order("starts_at"),
    ctx.supabase.from("tables").select("id, label, zone_id").eq("restaurant_id", ctx.restaurantId),
    ctx.supabase.from("zones").select("id, name").eq("restaurant_id", ctx.restaurantId),
  ]);

  type TableInfo = { id: string; label: string; zone_id: string | null };
  const tableById = new Map<string, TableInfo>((tables ?? []).map((t: any) => [t.id, t as TableInfo]));
  const zoneById = new Map<string, string>((zones ?? []).map((z: any) => [z.id, z.name]));

  const rows = (reservations ?? []).map((r: any) => {
    const table = tableById.get(r.table_id);
    const zone = table?.zone_id ? zoneById.get(table.zone_id) : null;
    const start = new Date(r.starts_at);
    return {
      buchungsnummer: r.code ?? "",
      datum: start.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" }),
      uhrzeit: start.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" }),
      gast: r.guest_name ?? "",
      personen: r.party_size,
      tisch: table?.label ?? "",
      bereich: zone ?? "",
      dauer_min: r.duration_min,
      quelle: r.source ?? "",
      status: r.status ?? "",
      telefon: r.phone ?? "",
      email: r.email ?? "",
      notiz: r.note ?? "",
      hinweis: r.approval_reason ?? "",
      angelegt_am: new Date(r.created_at).toLocaleString("de-DE", { timeZone: "Europe/Berlin" }),
    };
  });

  // CSV mit UTF-8-BOM, semicolon-separiert (Excel-DE-Standard)
  const SEP = ";";
  const headers = Object.keys(rows[0] ?? {
    buchungsnummer: "", datum: "", uhrzeit: "", gast: "", personen: "", tisch: "",
    bereich: "", dauer_min: "", quelle: "", status: "", telefon: "", email: "",
    notiz: "", hinweis: "", angelegt_am: "",
  });
  const headerLine = headers.map(humanHeader).join(SEP);
  const dataLines = rows.map((r: Record<string, unknown>) =>
    headers.map((h) => csvEscape(String((r as any)[h] ?? ""))).join(SEP),
  );
  const csv = "\uFEFF" + [headerLine, ...dataLines].join("\r\n");

  const filename = `reservierungen_${label}_${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

function humanHeader(key: string): string {
  const m: Record<string, string> = {
    buchungsnummer: "Buchungsnummer",
    datum: "Datum",
    uhrzeit: "Uhrzeit",
    gast: "Gast",
    personen: "Personen",
    tisch: "Tisch",
    bereich: "Bereich",
    dauer_min: "Dauer (Min)",
    quelle: "Quelle",
    status: "Status",
    telefon: "Telefon",
    email: "E-Mail",
    notiz: "Notiz",
    hinweis: "Hinweis",
    angelegt_am: "Angelegt am",
  };
  return m[key] ?? key;
}

function csvEscape(v: string): string {
  // Excel/CSV-Standard: Felder mit ; " oder \n in "..." quoten, " selbst → ""
  if (/[";\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function computeRange(period: string, customFrom: string | null, customTo: string | null) {
  const now = new Date();
  if (period === "custom" && customFrom && customTo) {
    return {
      from: new Date(`${customFrom}T00:00:00`),
      to: new Date(`${customTo}T23:59:59`),
      label: `${customFrom}_bis_${customTo}`,
    };
  }
  if (period === "today") {
    const from = new Date(now); from.setHours(0, 0, 0, 0);
    const to = new Date(from); to.setDate(to.getDate() + 1);
    return { from, to, label: "heute" };
  }
  if (period === "month") {
    const from = new Date(now); from.setHours(0, 0, 0, 0); from.setDate(from.getDate() - 29);
    const to = new Date(now); to.setHours(23, 59, 59, 999);
    return { from, to, label: "30tage" };
  }
  // default: week (7 Tage)
  const from = new Date(now); from.setHours(0, 0, 0, 0); from.setDate(from.getDate() - 6);
  const to = new Date(now); to.setHours(23, 59, 59, 999);
  return { from, to, label: "woche" };
}
