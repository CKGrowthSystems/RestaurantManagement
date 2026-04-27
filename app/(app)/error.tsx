"use client";
import { useEffect } from "react";
import { HiBtn } from "@/components/primitives";

/**
 * Next.js Error-Boundary fuer App-Routes.
 *
 * Faengt SSR-Errors die in den Page-Components geworfen werden (z.B.
 * Settings-Page laedt mit kaputtem Tenant-Context). Zeigt einen sauberen
 * Fallback statt einem 500-Stack-Trace.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app/error]", error);
    // Async an Sentry forwarden falls konfiguriert
    import("@/lib/sentry").then(({ captureError }) => {
      captureError(error, {
        level: "error",
        tags: { area: "app_route_error", digest: error.digest ?? "none" },
      });
    }).catch(() => {});
  }, [error]);

  return (
    <div style={{
      padding: "60px 32px",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "60vh",
      textAlign: "center",
    }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
      <h1 style={{ fontSize: 22, fontWeight: 600, color: "var(--hi-ink)", margin: "0 0 8px", letterSpacing: -0.3 }}>
        Da ist etwas schiefgelaufen
      </h1>
      <p style={{ fontSize: 14, color: "var(--hi-muted)", margin: "0 0 24px", maxWidth: 480, lineHeight: 1.6 }}>
        Diese Seite konnte nicht geladen werden. Probieren Sie es nochmal — falls es wieder passiert, melden Sie sich bei uns.
      </p>
      <div style={{ display: "flex", gap: 10 }}>
        <HiBtn kind="primary" size="md" onClick={reset}>
          Erneut versuchen
        </HiBtn>
        <HiBtn kind="outline" size="md" onClick={() => window.location.href = "/dashboard"}>
          Zum Dashboard
        </HiBtn>
      </div>
      {error.digest && (
        <div className="mono" style={{
          marginTop: 24,
          padding: "6px 10px",
          background: "var(--hi-surface-raised)",
          border: "1px solid var(--hi-line)",
          borderRadius: 6,
          fontSize: 10.5,
          color: "var(--hi-muted)",
        }}>
          Fehler-ID: {error.digest}
        </div>
      )}
    </div>
  );
}
