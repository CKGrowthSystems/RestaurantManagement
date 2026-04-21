"use client";
export function Sparkline({
  data, color = "var(--hi-accent)", width = 120, height = 28,
}: { data: number[]; color?: string; width?: number; height?: number }) {
  if (data.length === 0) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const pts = data
    .map((d, i) => `${(i / Math.max(1, data.length - 1)) * width},${height - ((d - min) / (max - min || 1)) * height}`)
    .join(" ");
  return (
    <svg width={width} height={height} style={{ marginTop: -2 }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
