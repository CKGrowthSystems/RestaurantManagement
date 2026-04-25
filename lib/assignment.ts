import type { Reservation, TableRow, Zone } from "./types";

export interface AssignmentCandidate {
  table: TableRow;
  zoneName: string | null;
  score: number;              // lower is better
  surplus: number;            // seats - partySize
  exactMatch: boolean;        // surplus 0-1 AND zone match (if requested)
  requiresApproval: boolean;  // assigned but needs owner OK (larger table than requested)
  reason: "Perfekter Match" | "Größer als nötig" | "Falscher Bereich" | "Barrierefrei";
  tone: "success" | "neutral" | "warn";
}

const BUFFER_MIN = 15;

export function rankCandidates(options: {
  tables: TableRow[];
  zones: Zone[];
  existing: Reservation[];
  partySize: number;
  startsAt: Date;
  durationMin: number;
  preferredZoneName?: string | null;
  requireAccessible?: boolean;
}): AssignmentCandidate[] {
  const {
    tables, zones, existing,
    partySize, startsAt, durationMin,
    preferredZoneName, requireAccessible,
  } = options;

  const zoneById = new Map(zones.map((z) => [z.id, z]));
  const slotStart = startsAt.getTime();
  const slotEnd = slotStart + durationMin * 60_000;

  const overlaps = (tableId: string) =>
    existing.some((r) => {
      if (r.table_id !== tableId) return false;
      if (r.status === "Storniert" || r.status === "Abgeschlossen" || r.status === "No-Show") return false;
      const rStart = new Date(r.starts_at).getTime() - BUFFER_MIN * 60_000;
      const rEnd = rStart + (r.duration_min + 2 * BUFFER_MIN) * 60_000;
      return !(slotEnd <= rStart || slotStart >= rEnd);
    });

  return tables
    .filter((t) => t.seats >= partySize)
    .filter((t) => (requireAccessible ? t.accessible : true))
    .filter((t) => !overlaps(t.id))
    .map<AssignmentCandidate>((t) => {
      const surplus = t.seats - partySize;
      const zoneName = t.zone_id ? zoneById.get(t.zone_id)?.name ?? null : null;
      const zoneMatch = preferredZoneName && zoneName ? zoneName === preferredZoneName : null;

      // Tighter-fit tables are preferred (golf score — lower is better)
      let score = surplus * 10;
      if (preferredZoneName) score += zoneMatch ? -25 : 30;
      if (t.accessible && !requireAccessible) score += 2;

      const zoneOk = !preferredZoneName || zoneMatch === true;
      const exactMatch = surplus <= 1 && zoneOk;
      const requiresApproval = !exactMatch;

      let reason: AssignmentCandidate["reason"];
      let tone: AssignmentCandidate["tone"];
      if (preferredZoneName && zoneMatch === false) {
        reason = "Falscher Bereich"; tone = "warn";
      } else if (surplus === 0) {
        reason = "Perfekter Match";  tone = "success";
      } else if (surplus <= 1) {
        reason = "Perfekter Match";  tone = "success";
      } else {
        reason = "Größer als nötig"; tone = "warn";
      }

      return { table: t, zoneName, score, surplus, exactMatch, requiresApproval, reason, tone };
    })
    .sort((a, b) => a.score - b.score);
}

export function bestCandidate(opts: Parameters<typeof rankCandidates>[0]) {
  return rankCandidates(opts)[0] ?? null;
}

/**
 * Decide auto-assignment result.
 *
 * Standard-Geschaeftsregel:
 *   - Kandidat gefunden    → Bestaetigt
 *   - Kein Kandidat        → Bestaetigt ohne Tisch (Team haendisch)
 *
 * Ausnahme (Stammtische / VIP-Tische):
 *   - Wenn best.table.requires_approval === true, geht die Reservierung auf
 *     status="Angefragt" statt "Bestaetigt". Der Wirt approved via Kanban.
 *   - approvalReason wird dann auf approval_note oder eine Default-Meldung
 *     gesetzt. Tisch bleibt reserviert (belegt den Slot), bis approve/reject.
 *
 * Das war fruehere Voice-KI-Reservierung sagte immer „FERTIG" — jetzt kann
 * sie bei Stammtischen „NOTIEREN" sagen und die eigentliche Bestaetigung
 * erfolgt asynchron durch das Team.
 */
export function autoAssign(opts: Parameters<typeof rankCandidates>[0]): {
  tableId: string | null;
  status: "Bestätigt" | "Angefragt";
  autoAssigned: boolean;
  approvalReason: string | null;
  reasonForAI: string;
} {
  const ranked = rankCandidates(opts);
  const best = ranked[0];

  if (!best) {
    return {
      tableId: null, status: "Bestätigt", autoAssigned: false, approvalReason: null,
      reasonForAI: "Kein passender Tisch frei – manuelle Zuordnung nötig.",
    };
  }

  // ======== Stammtisch / VIP-Tisch → Angefragt statt Bestaetigt ========
  if (best.table.requires_approval) {
    const note = best.table.approval_note?.trim();
    const approvalReason = note && note.length > 0
      ? `Freigabe erforderlich: ${note}`
      : `Freigabe erforderlich — Tisch ${best.table.label} braucht manuelle Bestätigung.`;
    return {
      tableId: best.table.id,
      status: "Angefragt",
      autoAssigned: true,
      approvalReason,
      reasonForAI: `Tisch ${best.table.label} vorgemerkt, Team bestätigt.`,
    };
  }

  // ======== Normalfall ========
  if (best.exactMatch) {
    return {
      tableId: best.table.id, status: "Bestätigt", autoAssigned: true, approvalReason: null,
      reasonForAI: `Tisch ${best.table.label} perfekt zugewiesen.`,
    };
  }

  // Reason fuer den Wirt formulieren — konkret und ohne Jargon.
  // Drei Faelle:
  //   1) Tisch ist groesser als noetig (>=2 Plaetze ueber)
  //   2) Wunsch-Bereich war nicht frei, anderer Bereich zugewiesen
  //   3) Beide Faelle gleichzeitig
  const tooBig = best.surplus >= 2;
  const wrongZone = !!opts.preferredZoneName && best.zoneName && best.zoneName !== opts.preferredZoneName;

  let reason: string;
  if (tooBig && wrongZone) {
    reason = `Größerer Tisch in „${best.zoneName}" zugewiesen (Wunsch war „${opts.preferredZoneName}", war voll). ${best.table.seats} Plätze für ${opts.partySize} Personen.`;
  } else if (tooBig) {
    reason = `Größerer Tisch zugewiesen — ${best.table.seats} Plätze für ${opts.partySize} Personen.`;
  } else if (wrongZone) {
    reason = `Im Wunsch-Bereich „${opts.preferredZoneName}" war nichts frei — Tisch in „${best.zoneName}" zugewiesen.`;
  } else {
    reason = "Tisch zugewiesen, kleiner Hinweis-Match.";
  }

  return {
    tableId: best.table.id, status: "Bestätigt", autoAssigned: true, approvalReason: reason,
    reasonForAI: `Tisch ${best.table.label} zugewiesen.`,
  };
}
