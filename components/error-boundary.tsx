"use client";
import React from "react";

/**
 * App-Wide React Error Boundary
 * ==============================
 *
 * Faengt JS-Errors die in Render/Lifecycle/Effect-Code geworfen werden.
 * Ohne diese laeuft die GANZE App in einen White-Screen wenn z.B. ein
 * undefined-Field beim Rendering einer Card geworfen wird.
 *
 * Verhalten:
 *  - Child-Tree crasht → Error-Boundary zeigt sauberen Fallback
 *  - Restaurant kann mit „Seite neu laden"-Button raus
 *  - Error wird in der Browser-Console + an Sentry (sofern konfiguriert)
 *    geloggt
 *
 * NICHT gefangen werden:
 *  - Errors in Event-Handlern (try/catch dort selbst)
 *  - Asynchrone Errors (Promise.catch)
 *  - SSR-Errors (Next.js error.tsx kuemmert sich)
 */

type Props = {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  /** Identifier fuer Logging — z.B. "Dashboard" oder "ReservationsKanban" */
  area?: string;
};

type State = {
  hasError: boolean;
  errorMessage?: string;
};

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: unknown): State {
    return {
      hasError: true,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    const area = this.props.area ?? "unknown";
    console.error(`[ErrorBoundary:${area}]`, error, info.componentStack);
    // Bei Sentry-Konfiguration: forwarden. Wir nutzen unseren leichten
    // Fetch-basierten Forwarder aus lib/sentry.ts.
    // Dynamisch importieren um SSR-Bundle nicht zu blasen.
    import("@/lib/sentry").then(({ captureError }) => {
      captureError(error, {
        level: "error",
        tags: { area, source: "react_error_boundary" },
      });
    }).catch(() => {});
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div style={{
          padding: "32px 24px",
          margin: 24,
          borderRadius: 12,
          border: "1px solid var(--hi-line)",
          background: "var(--hi-surface)",
          maxWidth: 560,
          fontSize: 13,
          lineHeight: 1.6,
          color: "var(--hi-ink)",
        }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>⚠️</div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
            Etwas ist schiefgelaufen
          </div>
          <div style={{ color: "var(--hi-muted)", marginBottom: 14 }}>
            Diese Komponente konnte nicht angezeigt werden. Wir wurden bereits über das Problem informiert.
          </div>
          {this.state.errorMessage && (
            <div className="mono" style={{
              padding: "8px 10px",
              background: "var(--hi-surface-raised)",
              border: "1px solid var(--hi-line)",
              borderRadius: 6,
              fontSize: 11.5,
              color: "var(--hi-muted-strong)",
              marginBottom: 14,
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
            }}>
              {this.state.errorMessage}
            </div>
          )}
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: "8px 16px",
              borderRadius: 7,
              fontSize: 13, fontWeight: 500,
              background: "var(--hi-accent)",
              color: "var(--hi-on-accent, #ffffff)",
              border: "none",
              cursor: "pointer",
            }}
          >
            Seite neu laden
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
