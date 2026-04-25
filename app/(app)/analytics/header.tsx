"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { HiBtn } from "@/components/primitives";

const PERIODS = [
  { id: "today", label: "Heute" },
  { id: "week",  label: "Woche" },
  { id: "month", label: "Monat" },
] as const;

type PeriodId = (typeof PERIODS)[number]["id"];

/**
 * Header-Buttons fuer Analytics: Zeitraum-Switcher (Heute/Woche/Monat) +
 * funktionierender CSV-Export (haengt das aktuelle Period an die URL des
 * Export-Endpoints, Browser laedt die Datei).
 */
export function AnalyticsHeader({ active }: { active: PeriodId }) {
  const router = useRouter();
  const params = useSearchParams();

  function setPeriod(p: PeriodId) {
    const next = new URLSearchParams(params?.toString());
    if (p === "week") next.delete("period");
    else next.set("period", p);
    const qs = next.toString();
    router.push(`/analytics${qs ? `?${qs}` : ""}`);
  }

  function exportCsv() {
    const qs = new URLSearchParams();
    qs.set("period", active);
    window.location.href = `/api/analytics/export?${qs.toString()}`;
  }

  return (
    <div style={{ display: "flex", gap: 8 }}>
      <div style={{
        display: "flex",
        background: "var(--hi-surface)",
        border: "1px solid var(--hi-line)",
        borderRadius: 7,
        overflow: "hidden",
      }}>
        {PERIODS.map((p) => {
          const selected = active === p.id;
          return (
            <button
              key={p.id}
              onClick={() => setPeriod(p.id)}
              style={{
                padding: "7px 14px", fontSize: 12, fontWeight: 500,
                background: selected
                  ? "color-mix(in oklch, var(--hi-accent) 18%, var(--hi-surface))"
                  : "transparent",
                color: selected ? "var(--hi-accent)" : "var(--hi-muted-strong)",
                border: "none",
                borderRight: p.id !== "month" ? "1px solid var(--hi-line)" : "none",
                cursor: "pointer",
              }}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      <HiBtn kind="ghost" size="md" icon="export" onClick={exportCsv}>Export CSV</HiBtn>
    </div>
  );
}
