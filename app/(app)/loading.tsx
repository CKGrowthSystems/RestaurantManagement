/**
 * Instant loading state for any page under /(app).
 * Wird von Next.js automatisch waehrend der Server-Renders gestreamt,
 * sodass der Nutzer sofort einen Hinweis sieht, statt auf einer scheinbar
 * eingefrorenen Seite zu warten.
 */
export default function AppLoading() {
  return (
    <div
      style={{
        display: "flex", flexDirection: "column", minHeight: "100%",
        position: "relative",
      }}
    >
      {/* Topbar skeleton */}
      <div
        style={{
          display: "flex", alignItems: "center", gap: 16,
          padding: "18px 28px",
          borderBottom: "1px solid var(--hi-line)",
          background: "var(--hi-bg)",
        }}
      >
        <div style={{ flex: 1 }}>
          <div style={skeletonLine(180, 18)} />
          <div style={{ ...skeletonLine(260, 11), marginTop: 6 }} />
        </div>
        <div style={{ ...skeletonLine(260, 32), borderRadius: 8 }} />
        <div style={{ ...skeletonLine(32, 32), borderRadius: 8 }} />
      </div>

      {/* Content skeleton — horizontale Balken, akzent-farbiger Loader-Strich */}
      <div style={{
        flex: 1, padding: "22px 28px",
        display: "flex", flexDirection: "column", gap: 14,
      }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} style={cardSkeleton} />
          ))}
        </div>
        <div style={{ ...cardSkeleton, height: 180 }} />
        <div style={{ ...cardSkeleton, height: 260 }} />
      </div>

      {/* Top-edge progress bar */}
      <div
        aria-hidden
        style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 2,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: "30%", height: "100%",
            background: "var(--hi-accent)",
            animation: "hi-progress 1.1s ease-in-out infinite",
          }}
        />
      </div>

      <style>{`
        @keyframes hi-progress {
          0%   { transform: translateX(-100%); }
          60%  { transform: translateX(260%); }
          100% { transform: translateX(260%); }
        }
        @keyframes hi-skeleton-shimmer {
          0%   { opacity: 0.4; }
          50%  { opacity: 0.7; }
          100% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}

function skeletonLine(width: number | string, height: number): React.CSSProperties {
  return {
    width, height, borderRadius: 4,
    background: "var(--hi-surface-raised)",
    animation: "hi-skeleton-shimmer 1.4s ease-in-out infinite",
  };
}

const cardSkeleton: React.CSSProperties = {
  height: 90,
  borderRadius: 10,
  background: "var(--hi-surface)",
  border: "1px solid var(--hi-line)",
  animation: "hi-skeleton-shimmer 1.4s ease-in-out infinite",
};
