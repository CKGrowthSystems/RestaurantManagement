/**
 * MCP (Model Context Protocol) Server Endpoint
 * ============================================
 *
 * Implements the streamable-HTTP transport of MCP with JSON-RPC 2.0.
 * Exposes the 4 restaurant tools as a single MCP server so GHL's
 * "MCP hinzufügen (Beta)" can connect to it.
 *
 * Endpoint URL (production):
 *   https://restaurant-management-eight-mocha.vercel.app/api/mcp
 *
 * Auth:  X-Webhook-Secret header (same as the /v1/voice/* endpoints).
 *
 * Protocol:
 *   POST with JSON-RPC 2.0 body. Supported methods:
 *     - initialize         → server info + capabilities
 *     - notifications/initialized
 *     - tools/list         → array of 4 tools with JSON-Schema
 *     - tools/call         → { name, arguments } → tool result
 *     - ping               → health
 *
 * Responses: `application/json` (non-streaming). The tools do their
 * work synchronously and return a text content block.
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { authenticateWebhook } from "@/lib/voice-auth";
import { rankCandidates, autoAssign } from "@/lib/assignment";
import type { Reservation, TableRow, Zone } from "@/lib/types";

export const runtime = "nodejs";

/* --------------------------------------------------------------
 * MCP tool catalogue
 * ------------------------------------------------------------ */
const TOOLS = [
  {
    name: "check_availability",
    description:
      "Pflicht-Tool. Rufe dieses Tool IMMER auf, sobald der Gast eine Reservierung oder einen Tisch erwähnt. Prüft, ob ein passender Tisch zum gewünschten Zeitpunkt für die gewünschte Personenzahl verfügbar ist. Gibt im Feld 'instruction' Klartext zurück, was der Agent als Nächstes sagen/tun soll (BESTAETIGEN / ABSAGEN / NACHFRAGEN).",
    inputSchema: {
      type: "object",
      properties: {
        party_size: { type: "integer", minimum: 1, maximum: 40, description: "Anzahl der Gäste." },
        starts_at: { type: "string", description: "Reservierungszeitpunkt als ISO-8601 mit Zeitzone, z. B. 2026-04-22T19:30:00+02:00." },
        duration_min: { type: "integer", default: 90, description: "Aufenthaltsdauer in Minuten. Standard 90." },
        zone: { type: "string", enum: ["Innenraum", "Fenster", "Terrasse"], description: "Wunschbereich." },
        accessible: { type: "boolean", description: "Barrierefrei erforderlich?" },
      },
      required: ["party_size", "starts_at"],
    },
  },
  {
    name: "create_reservation",
    description:
      "Legt eine verbindliche Reservierung an. NUR aufrufen, nachdem check_availability erfolgreich war (available=true) und alle Kontaktdaten gesammelt sind. Gibt 'instruction' zurück mit FERTIG: (verbindlich reserviert), NOTIEREN: (wird noch bestätigt) oder ABSAGEN:.",
    inputSchema: {
      type: "object",
      properties: {
        guest_name: { type: "string", description: "Vollständiger Name des Gastes." },
        phone: { type: "string", description: "Telefonnummer mit Ländervorwahl." },
        email: { type: "string" },
        party_size: { type: "integer", minimum: 1, maximum: 40 },
        starts_at: { type: "string", description: "ISO-8601 mit Zeitzone." },
        duration_min: { type: "integer", default: 90 },
        zone: { type: "string", enum: ["Innenraum", "Fenster", "Terrasse"] },
        accessible: { type: "boolean" },
        note: { type: "string", description: "Besondere Wünsche, Allergien, Anlass." },
      },
      required: ["guest_name", "party_size", "starts_at"],
    },
  },
  {
    name: "get_opening_hours",
    description: "Gibt die Öffnungszeiten pro Wochentag zurück. Für Fragen wie 'wann habt ihr auf?'.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "cancel_reservation",
    description:
      "Storniert eine bestehende Reservierung. Entweder per reservation_id (falls bekannt) oder per phone + starts_at zur Identifikation.",
    inputSchema: {
      type: "object",
      properties: {
        reservation_id: { type: "string" },
        phone: { type: "string" },
        starts_at: { type: "string", description: "ISO-8601 mit Zeitzone." },
      },
    },
  },
];

/* --------------------------------------------------------------
 * JSON-RPC helpers
 * ------------------------------------------------------------ */
function rpcResult(id: number | string | null, result: unknown) {
  return { jsonrpc: "2.0", id, result };
}
function rpcError(id: number | string | null, code: number, message: string, data?: unknown) {
  return { jsonrpc: "2.0", id, error: { code, message, data } };
}
function textContent(obj: unknown) {
  // MCP tool results use a content array with typed blocks.
  return {
    content: [{ type: "text", text: typeof obj === "string" ? obj : JSON.stringify(obj, null, 2) }],
    structuredContent: typeof obj === "object" ? obj : undefined,
  };
}

/* --------------------------------------------------------------
 * Tool implementations
 * ------------------------------------------------------------ */
async function callTool(name: string, args: Record<string, unknown>, restaurantId: string) {
  const admin = createAdminClient();

  if (name === "check_availability") {
    const party = Number(args.party_size);
    const durationMin = Number(args.duration_min ?? 90);
    const startsAtRaw = args.starts_at as string | undefined;
    if (!Number.isFinite(party) || party <= 0 || !startsAtRaw) {
      return textContent({
        available: false,
        instruction:
          "NACHFRAGEN: Es fehlen Personenzahl und/oder Datum+Uhrzeit. Frage den Gast explizit nach diesen Angaben und rufe das Tool dann erneut auf. KEINE Reservierung bestätigen.",
        missing: {
          party_size: !Number.isFinite(party) || party <= 0,
          starts_at: !startsAtRaw,
        },
      });
    }
    const startsAt = new Date(startsAtRaw);

    const [{ data: tables }, { data: zones }, { data: existing }] = await Promise.all([
      admin.from("tables").select("*").eq("restaurant_id", restaurantId),
      admin.from("zones").select("*").eq("restaurant_id", restaurantId),
      admin
        .from("reservations")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .gte("starts_at", new Date(startsAt.getTime() - 4 * 3600_000).toISOString())
        .lte("starts_at", new Date(startsAt.getTime() + 4 * 3600_000).toISOString()),
    ]);

    const ranked = rankCandidates({
      tables: (tables ?? []) as TableRow[],
      zones: (zones ?? []) as Zone[],
      existing: (existing ?? []) as Reservation[],
      partySize: party,
      startsAt,
      durationMin,
      preferredZoneName: (args.zone as string) ?? null,
      requireAccessible: !!args.accessible,
    });
    const timeStr = startsAt.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });
    const dateStr = startsAt.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Berlin" });
    const totalTables = (tables ?? []).length;

    if (totalTables === 0) {
      return textContent({
        available: false, total_tables_in_system: 0,
        instruction:
          "ABSAGEN: Es sind aktuell keine Tische im System konfiguriert. Dem Gast höflich mitteilen, dass momentan keine Online-Reservierung möglich ist, und auf 07803 926970 verweisen.",
      });
    }
    if (ranked.length === 0) {
      return textContent({
        available: false, total_tables_in_system: totalTables,
        instruction: `ABSAGEN: Für ${party} Personen am ${dateStr} um ${timeStr} ist kein passender Tisch verfügbar. Biete dem Gast eine andere Uhrzeit oder einen anderen Tag an.`,
      });
    }
    const best = ranked[0];
    const zoneName = (zones ?? []).find((z) => z.id === best.table.zone_id)?.name ?? "Innenraum";
    return textContent({
      available: true,
      total_tables_in_system: totalTables,
      instruction: `BESTAETIGEN: Tisch für ${party} Personen am ${dateStr} um ${timeStr} im Bereich ${zoneName} ist verfügbar. Wiederhole dem Gast Datum, Uhrzeit und Personenzahl, dann frage nach Namen und Telefonnummer.`,
      best: {
        label: best.table.label,
        seats: best.table.seats,
        zone: zoneName,
        reason: best.reason,
      },
    });
  }

  if (name === "create_reservation") {
    const party = Number(args.party_size);
    const durationMin = Number(args.duration_min ?? 90);
    if (!args.guest_name || !Number.isFinite(party) || party <= 0 || !args.starts_at) {
      return textContent({
        instruction:
          "NACHFRAGEN: Es fehlen Pflichtfelder für die Reservierung. Frage den Gast nach Name, Personenzahl und Zeitpunkt. KEINE Reservierung anlegen.",
        missing: {
          guest_name: !args.guest_name,
          party_size: !Number.isFinite(party) || party <= 0,
          starts_at: !args.starts_at,
        },
      });
    }
    const startsAt = new Date(args.starts_at as string);

    const [{ data: tables }, { data: zones }, { data: existing }] = await Promise.all([
      admin.from("tables").select("*").eq("restaurant_id", restaurantId),
      admin.from("zones").select("*").eq("restaurant_id", restaurantId),
      admin
        .from("reservations")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .gte("starts_at", new Date(startsAt.getTime() - 4 * 3600_000).toISOString())
        .lte("starts_at", new Date(startsAt.getTime() + 4 * 3600_000).toISOString()),
    ]);
    const decision = autoAssign({
      tables: (tables ?? []) as TableRow[],
      zones: (zones ?? []) as Zone[],
      existing: (existing ?? []) as Reservation[],
      partySize: party,
      startsAt,
      durationMin,
      preferredZoneName: (args.zone as string) ?? null,
      requireAccessible: !!args.accessible,
    });
    const { data: reservation, error } = await admin
      .from("reservations")
      .insert({
        restaurant_id: restaurantId,
        table_id: decision.tableId,
        guest_name: args.guest_name,
        phone: args.phone ?? null,
        email: args.email ?? null,
        party_size: party,
        starts_at: startsAt.toISOString(),
        duration_min: durationMin,
        source: "Voice-KI",
        status: decision.status,
        note: args.note ?? null,
        auto_assigned: decision.autoAssigned,
        approval_reason: decision.approvalReason,
      })
      .select()
      .single();
    if (error || !reservation) {
      return textContent({ instruction: `ABSAGEN: Reservierung konnte nicht gespeichert werden (${error?.message}). Bitte auf 07803 926970 verweisen.` });
    }
    const assignedTable = decision.tableId ? ((tables ?? []) as TableRow[]).find((t) => t.id === decision.tableId) : null;
    const zoneName = assignedTable?.zone_id ? (zones ?? []).find((z) => z.id === assignedTable.zone_id)?.name ?? null : null;

    const timeStr = startsAt.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });
    const dateStr = startsAt.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Berlin" });

    let instruction: string;
    if (!assignedTable) {
      instruction = `ABSAGEN: Für ${party} Personen am ${dateStr} ${timeStr} ist kein Tisch verfügbar. Reservierung nicht angelegt.`;
    } else if (decision.status === "Offen" && decision.autoAssigned) {
      instruction = `NOTIEREN: Reservierung vorgemerkt (größerer Tisch zugewiesen). Sage dem Gast: "Ich habe Sie notiert, ein Kollege bestätigt zeitnah."`;
    } else {
      instruction = `FERTIG: Reservierung fest für ${args.guest_name}, ${party} Personen, ${dateStr} ${timeStr}, Bereich ${zoneName ?? "Innenraum"}. Bestätige: "Perfekt, ich habe Sie fest eingetragen."`;
    }
    return textContent({
      reservation_id: reservation.id,
      status: decision.status,
      instruction,
    });
  }

  if (name === "get_opening_hours") {
    const { data } = await admin.from("settings").select("opening_hours").eq("restaurant_id", restaurantId).maybeSingle();
    const hoursData = (data?.opening_hours ?? null) as Record<string, { open: string; close: string }> | null;
    const days: Record<string, string> = { mo: "Montag", tu: "Dienstag", we: "Mittwoch", th: "Donnerstag", fr: "Freitag", sa: "Samstag", su: "Sonntag" };
    const dayKey = ["su", "mo", "tu", "we", "th", "fr", "sa"][new Date().getDay()];
    const todayHours = hoursData?.[dayKey];
    const instruction = todayHours
      ? `Heute (${days[dayKey]}) ist das Restaurant von ${todayHours.open} bis ${todayHours.close} geöffnet. Bei Fragen zu anderen Tagen: nutze die 'hours'-Liste.`
      : `Heute geschlossen. Dem Gast das mitteilen.`;
    return textContent({ hours: hoursData, instruction });
  }

  if (name === "cancel_reservation") {
    let query = admin.from("reservations").update({ status: "Storniert" }).eq("restaurant_id", restaurantId);
    if (args.reservation_id) {
      query = query.eq("id", args.reservation_id as string);
    } else if (args.phone && args.starts_at) {
      const start = new Date(args.starts_at as string);
      query = query
        .eq("phone", args.phone as string)
        .gte("starts_at", new Date(start.getTime() - 30 * 60_000).toISOString())
        .lte("starts_at", new Date(start.getTime() + 30 * 60_000).toISOString());
    } else {
      return textContent({
        instruction: "NACHFRAGEN: Entweder reservation_id oder (phone + starts_at) sind nötig. Frage beim Gast nach Telefonnummer und ursprünglichem Termin.",
      });
    }
    const { data, error } = await query.select();
    if (error) return textContent({ instruction: `ABSAGEN: Storno fehlgeschlagen (${error.message}).` });
    const n = data?.length ?? 0;
    return textContent({
      cancelled: n,
      instruction:
        n > 0
          ? `FERTIG: ${n} Reservierung storniert. Sage dem Gast: "Ich habe Ihre Reservierung storniert."`
          : `NACHFRAGEN: Keine passende Reservierung gefunden. Prüfe Telefonnummer und Zeitpunkt mit dem Gast.`,
    });
  }

  throw new Error(`Unknown tool: ${name}`);
}

/* --------------------------------------------------------------
 * HTTP handlers
 * ------------------------------------------------------------ */
export async function POST(request: Request) {
  const auth = await authenticateWebhook(request);
  if ("error" in auth) {
    return NextResponse.json(rpcError(null, -32000, auth.error), { status: auth.status });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(rpcError(null, -32700, "Parse error"), { status: 400 });
  }

  // Supports either a single request or a batch
  const requests = Array.isArray(body) ? body : [body];
  const responses: any[] = [];

  for (const req of requests) {
    const { id = null, method, params = {} } = req ?? {};
    try {
      if (method === "initialize") {
        responses.push(
          rpcResult(id, {
            protocolVersion: "2024-11-05",
            capabilities: { tools: { listChanged: false } },
            serverInfo: { name: "rhodos-tables-mcp", version: "1.0.0" },
          }),
        );
      } else if (method === "notifications/initialized") {
        // notifications don't return results
      } else if (method === "ping") {
        responses.push(rpcResult(id, {}));
      } else if (method === "tools/list") {
        responses.push(rpcResult(id, { tools: TOOLS }));
      } else if (method === "tools/call") {
        const { name, arguments: args = {} } = params as { name: string; arguments?: Record<string, unknown> };
        const result = await callTool(name, args, auth.restaurantId);
        responses.push(rpcResult(id, result));
      } else {
        responses.push(rpcError(id, -32601, `Method not found: ${method}`));
      }
    } catch (err: any) {
      responses.push(rpcError(id, -32603, "Internal error", { message: err?.message ?? String(err) }));
    }
  }

  // Notifications have no response — filter undefined
  const toReturn = responses.filter(Boolean);
  if (toReturn.length === 0) return new NextResponse(null, { status: 204 });
  return NextResponse.json(Array.isArray(body) ? toReturn : toReturn[0]);
}

export async function GET() {
  // Health check / easy smoke test in browser
  return NextResponse.json({
    ok: true,
    server: "rhodos-tables-mcp",
    protocol: "MCP / JSON-RPC 2.0 over HTTP",
    tools: TOOLS.map((t) => t.name),
    usage: "POST { jsonrpc: '2.0', id, method, params } with X-Webhook-Secret header",
  });
}
