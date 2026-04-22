"use client";
import { useState } from "react";
import { HiCard, HiIcon } from "@/components/primitives";

// Hard-coded by design: this is a soft-lock for an area already behind Supabase auth.
// Anyone with a tenant login who also has this password can open Voice-KI.
const PASSWORD = "LatifSerkan2026!";

/**
 * Password-Gate fuer /voice.
 * State lebt nur im Component — **keine Persistenz**. Jeder Besuch
 * (Navigation zurueck zu /voice oder Reload) bewirkt ein erneutes
 * Unmount + Mount von PasswordGate und damit eine frische Abfrage.
 */
export function PasswordGate({ children }: { children: React.ReactNode }) {
  const [unlocked, setUnlocked] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (value === PASSWORD) {
      setUnlocked(true);
      setError(false);
    } else {
      setError(true);
      setValue("");
    }
  }

  if (unlocked) return <>{children}</>;

  return (
    <div style={{
      flex: 1, minHeight: "100vh",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 24,
      background:
        "radial-gradient(circle at 30% 20%, color-mix(in oklch, var(--hi-accent) 10%, transparent) 0%, transparent 50%)," +
        "var(--hi-bg)",
    }}>
      <HiCard style={{ padding: 0, maxWidth: 420, width: "100%", overflow: "hidden" }}>
        <div style={{
          padding: "28px 28px 18px",
          borderBottom: "1px solid var(--hi-line)",
          background: "color-mix(in oklch, var(--hi-accent) 6%, var(--hi-surface))",
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: 11,
            background: "color-mix(in oklch, var(--hi-accent) 18%, var(--hi-surface))",
            color: "var(--hi-accent)",
            display: "flex", alignItems: "center", justifyContent: "center",
            marginBottom: 14,
          }}>
            <HiIcon kind="voice" size={22} />
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0, color: "var(--hi-ink)", letterSpacing: -0.2 }}>
            Voice-KI gesichert
          </h2>
          <p style={{ fontSize: 12.5, color: "var(--hi-muted)", margin: "6px 0 0", lineHeight: 1.5 }}>
            Dieser Bereich steuert den Voice-Agent und die Webhooks. Bitte gib das Zugangspasswort ein, um fortzufahren.
          </p>
        </div>
        <form onSubmit={submit} style={{ padding: 24 }}>
          <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.8, textTransform: "uppercase", color: "var(--hi-muted)", display: "block", marginBottom: 8 }}>
            Zugangspasswort
          </label>
          <input
            type="password"
            autoFocus
            value={value}
            onChange={(e) => { setValue(e.target.value); setError(false); }}
            placeholder="••••••••••••"
            style={{
              width: "100%",
              background: "var(--hi-surface-raised)",
              border: `1px solid ${error ? "oklch(0.66 0.2 25)" : "var(--hi-line)"}`,
              borderRadius: 8, padding: "10px 12px",
              fontSize: 14, color: "var(--hi-ink)", outline: "none",
              fontFamily: "inherit",
            }}
          />
          {error && (
            <div style={{ fontSize: 12, color: "oklch(0.72 0.18 25)", marginTop: 8 }}>
              Passwort falsch. Bitte erneut versuchen.
            </div>
          )}
          <button
            type="submit"
            style={{
              width: "100%",
              marginTop: 14,
              padding: "10px 14px",
              borderRadius: 8,
              border: "1px solid var(--hi-accent)",
              background: "var(--hi-accent)",
              color: "var(--hi-on-accent)",
              fontSize: 13, fontWeight: 600,
              cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}
          >
            <HiIcon kind="check" size={14} />
            Entsperren
          </button>
          <div style={{ fontSize: 10.5, color: "var(--hi-muted)", marginTop: 14, textAlign: "center" }}>
            Gilt für diese Browser-Session.
          </div>
        </form>
      </HiCard>
    </div>
  );
}
