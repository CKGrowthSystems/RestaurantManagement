import React from "react";
import { RhodosWordmark } from "@/components/primitives";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        gridTemplateColumns: "1fr 420px",
        background: "var(--hi-bg)",
      }}
    >
      <aside
        style={{
          display: "flex", flexDirection: "column", justifyContent: "space-between",
          padding: "48px 52px",
          background:
            "radial-gradient(120% 80% at 0% 0%, color-mix(in oklch, var(--hi-accent) 18%, var(--hi-bg)), var(--hi-bg) 55%)",
          borderRight: "1px solid var(--hi-line)",
        }}
      >
        <RhodosWordmark />
        <div>
          <h2 style={{ fontSize: 30, fontWeight: 600, letterSpacing: -0.5, margin: 0, color: "var(--hi-ink)" }}>
            Tischverwaltung, die mitdenkt.
          </h2>
          <p style={{ fontSize: 14, color: "var(--hi-muted-strong)", marginTop: 12, lineHeight: 1.6, maxWidth: 440 }}>
            Voice-KI beantwortet Anrufe rund um die Uhr, prüft Verfügbarkeit, schlägt den passenden Tisch vor und bucht –
            alles synchron zum Floorplan. Sie behalten die Hoheit.
          </p>
        </div>
        <div style={{ fontSize: 11, color: "var(--hi-muted)" }}>
          © Rhodos Tables · Whitelabel SaaS für Restaurants
        </div>
      </aside>
      <main
        style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: 32,
        }}
      >
        <div style={{ width: "100%", maxWidth: 360 }}>{children}</div>
      </main>
    </div>
  );
}
