/**
 * Minimaler Sentry-Forwarder ohne Dependency
 * ===========================================
 *
 * Sendet Errors via fetch an die Sentry-Envelope-API. Aktiv nur wenn
 * `SENTRY_DSN` gesetzt ist — sonst No-Op (System laeuft normal weiter).
 *
 * Warum nicht @sentry/nextjs?
 *  - Keine zusaetzliche Dependency / kein Bundle-Bloat.
 *  - Funktioniert auf Edge/Node/Browser.
 *  - Wir wollen Errors NUR an Sentry forwarden, keine Performance-Tracing
 *    o.ae. — dafuer reicht ein Fetch.
 *  - Spaeter kann man @sentry/nextjs einbauen wenn man Source-Maps und
 *    Auto-Instrumentation will. Diese Layer hier ist fully replaceable.
 *
 * DSN-Format: https://<public_key>@<host>/<project_id>
 * Ingest:     https://<host>/api/<project_id>/envelope/
 */

type SentryDSN = {
  publicKey: string;
  host: string;
  projectId: string;
};

let cachedDsn: SentryDSN | null | undefined = undefined;

function parseDsn(): SentryDSN | null {
  if (cachedDsn !== undefined) return cachedDsn;
  const raw = process.env.SENTRY_DSN;
  if (!raw) {
    cachedDsn = null;
    return null;
  }
  try {
    const url = new URL(raw);
    const publicKey = url.username;
    const host = url.host;
    const projectId = url.pathname.replace(/^\//, "").split("/")[0];
    if (!publicKey || !host || !projectId) {
      cachedDsn = null;
      return null;
    }
    cachedDsn = { publicKey, host, projectId };
    return cachedDsn;
  } catch {
    cachedDsn = null;
    return null;
  }
}

function uuid(): string {
  // 32-hex-chars Event-ID, Sentry-konform (kein Dash)
  return [...crypto.getRandomValues(new Uint8Array(16))]
    .map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type CaptureContext = {
  level?: "fatal" | "error" | "warning" | "info";
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
  user?: { restaurantId?: string; id?: string };
  fingerprint?: string[];
};

/**
 * Sendet einen Error an Sentry. Best-Effort: wenn fetch failt oder DSN
 * fehlt, passiert NICHTS — der aufrufende Code laeuft normal weiter.
 *
 * Fire-and-forget: kein await im Hot-Path.
 */
export function captureError(error: unknown, ctx?: CaptureContext): void {
  const dsn = parseDsn();
  if (!dsn) return;

  const err = error instanceof Error ? error : new Error(String(error));
  const eventId = uuid();
  const sentAt = new Date().toISOString();

  const eventPayload = {
    event_id: eventId,
    timestamp: Date.now() / 1000,
    platform: "javascript",
    level: ctx?.level ?? "error",
    server_name: process.env.VERCEL_URL ?? "hostsystem",
    release: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7),
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
    tags: ctx?.tags,
    extra: ctx?.extra,
    user: ctx?.user ? { id: ctx.user.id, restaurant_id: ctx.user.restaurantId } : undefined,
    fingerprint: ctx?.fingerprint,
    exception: {
      values: [
        {
          type: err.name ?? "Error",
          value: err.message?.slice(0, 1000),
          stacktrace: err.stack ? parseStack(err.stack) : undefined,
        },
      ],
    },
  };

  const envelope = [
    JSON.stringify({ event_id: eventId, sent_at: sentAt, dsn: process.env.SENTRY_DSN }),
    JSON.stringify({ type: "event" }),
    JSON.stringify(eventPayload),
  ].join("\n");

  const url = `https://${dsn.host}/api/${dsn.projectId}/envelope/`;
  const auth = [
    "Sentry sentry_version=7",
    `sentry_client=hostsystem/1.0.0`,
    `sentry_key=${dsn.publicKey}`,
  ].join(",");

  // Fire-and-forget — wir wollen NICHT auf Sentry warten
  fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-sentry-envelope",
      "X-Sentry-Auth": auth,
    },
    body: envelope,
  }).catch((e) => {
    // Sentry selbst kann niemals einen Crash ausloesen
    console.warn("[sentry] forward failed:", e?.message ?? e);
  });
}

/**
 * Stack-Parser → Sentry-Frame-Format. Best-Effort, ungeparste Frames werden
 * als-ist als String beigelegt damit Sentry sie wenigstens roh anzeigt.
 */
function parseStack(stack: string): { frames: Array<{ filename: string; function: string; lineno?: number; colno?: number }> } {
  const lines = stack.split("\n").map((l) => l.trim()).filter(Boolean);
  const frames: Array<{ filename: string; function: string; lineno?: number; colno?: number }> = [];
  for (const line of lines) {
    // Format: "at FuncName (file:line:col)" oder "at file:line:col"
    const m = line.match(/^at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?$/);
    if (m) {
      frames.push({
        function: m[1] ?? "<anonymous>",
        filename: m[2],
        lineno: parseInt(m[3], 10),
        colno: parseInt(m[4], 10),
      });
    }
  }
  // Sentry will sie reverse-chronological: erste Frame = erste Aufruf
  return { frames: frames.reverse() };
}

/**
 * True wenn Sentry konfiguriert ist. Praktisch fuer Test-Endpoints
 * oder Status-UI.
 */
export function isSentryEnabled(): boolean {
  return parseDsn() !== null;
}
