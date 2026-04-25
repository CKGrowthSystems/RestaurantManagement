/**
 * Globaler Footer auf jeder Seite.
 * Zeigt das Produkt-Branding, Copyright + (im Light-Mode) eine subtile
 * Trennlinie. Server-Komponente, kein Re-Render.
 */
export function AppFooter() {
  const year = new Date().getFullYear();
  return (
    <footer
      style={{
        padding: "10px 28px",
        borderTop: "1px solid var(--hi-line)",
        background: "var(--hi-bg)",
        textAlign: "center",
        fontSize: 11,
        color: "var(--hi-muted)",
        letterSpacing: 0.4,
        flexShrink: 0,
      }}
    >
      HostSystem — Copyright {year} by{" "}
      <span style={{ color: "var(--hi-muted-strong)", fontWeight: 500 }}>
        CK GrowthSystems<sup style={{ fontSize: 8, marginLeft: 1 }}>®</sup>
      </span>
    </footer>
  );
}
