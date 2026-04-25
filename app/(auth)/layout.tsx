import React from "react";
import { BrandWordmark } from "@/components/primitives";

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
        <BrandWordmark />
        <div>
          <h2 style={{ fontSize: 30, fontWeight: 600, letterSpacing: -0.5, margin: 0, color: "var(--hi-ink)" }}>
            Reservations that run themselves.
          </h2>
          <p style={{ fontSize: 14, color: "var(--hi-muted-strong)", marginTop: 12, lineHeight: 1.6, maxWidth: 440 }}>
            HostSystem answers your phone 24/7, checks availability, picks the
            right table and books — all in sync with your floorplan. You keep
            full control.
          </p>
        </div>
        <div style={{ fontSize: 11, color: "var(--hi-muted)" }}>
          © {new Date().getFullYear()} HostSystem · by CK GrowthSystems
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
