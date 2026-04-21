"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import React from "react";
import { createClient } from "@/lib/supabase/browser";
import { HiBtn, HiIcon, HiPill, RhodosWordmark, type IconKind } from "./primitives";

const NAV: { href: string; id: string; label: string; icon: IconKind }[] = [
  { href: "/dashboard",    id: "dashboard",    label: "Dashboard",      icon: "grid" },
  { href: "/floorplan",    id: "floorplan",    label: "Tischplan",      icon: "floor" },
  { href: "/reservations", id: "reservations", label: "Reservierungen", icon: "clock" },
  { href: "/tables",       id: "tables",       label: "Tische",         icon: "table" },
  { href: "/voice",        id: "voice",        label: "Voice-KI",       icon: "voice" },
  { href: "/analytics",    id: "analytics",    label: "Analytics",      icon: "chart" },
  { href: "/settings",     id: "settings",     label: "Einstellungen",  icon: "settings" },
];

export function Sidebar({
  displayName, role, restaurantName, badges,
}: {
  displayName: string;
  role: string;
  restaurantName: string;
  badges?: Partial<Record<string, { n: number; tone?: "accent" | "neutral" }>>;
}) {
  const pathname = usePathname() || "";
  const router = useRouter();
  const initials = displayName.slice(0, 2).toUpperCase();

  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <aside
      style={{
        width: 232, flexShrink: 0,
        background: "var(--hi-bg)",
        borderRight: "1px solid var(--hi-line)",
        display: "flex", flexDirection: "column",
        padding: "20px 14px",
        height: "100vh", position: "sticky", top: 0,
      }}
    >
      <div style={{ padding: "4px 8px 6px" }}>
        <RhodosWordmark name={restaurantName.toUpperCase()} sub="TABLES" />
      </div>
      <div
        style={{
          fontSize: 10, color: "var(--hi-muted)", letterSpacing: 1.2,
          padding: "18px 10px 8px", fontWeight: 600,
        }}
      >
        NAVIGATION
      </div>
      <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {NAV.map((n) => {
          const active = pathname === n.href || pathname.startsWith(n.href + "/");
          const badge = badges?.[n.id];
          return (
            <Link
              key={n.id}
              href={n.href}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "8px 10px", borderRadius: 7,
                fontSize: 13, fontWeight: 500,
                color: active ? "var(--hi-ink)" : "var(--hi-muted-strong)",
                background: active ? "var(--hi-surface-raised)" : "transparent",
              }}
            >
              <HiIcon kind={n.icon} size={15} />
              <span style={{ flex: 1 }}>{n.label}</span>
              {badge && badge.n > 0 && (
                <span
                  className="mono"
                  style={{
                    fontSize: 10, fontWeight: 600,
                    padding: "1px 6px", borderRadius: 9,
                    background:
                      badge.tone === "accent"
                        ? "color-mix(in oklch, var(--hi-accent) 18%, transparent)"
                        : "rgba(255,255,255,0.07)",
                    color: badge.tone === "accent" ? "var(--hi-accent)" : "var(--hi-muted-strong)",
                  }}
                >
                  {badge.n}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      <div style={{ marginTop: "auto" }}>
        <div
          style={{
            padding: 12, borderRadius: 10,
            background: "var(--hi-surface)", border: "1px solid var(--hi-line)",
            display: "flex", alignItems: "center", gap: 10,
          }}
        >
          <div
            style={{
              width: 32, height: 32, borderRadius: 8,
              background: "color-mix(in oklch, var(--hi-accent) 20%, var(--hi-surface))",
              color: "var(--hi-accent)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 12, fontWeight: 600,
            }}
          >
            {initials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--hi-ink)" }}>{displayName}</div>
            <div style={{ fontSize: 10.5, color: "var(--hi-muted)", textTransform: "capitalize" }}>{role}</div>
          </div>
          <button
            onClick={logout}
            title="Abmelden"
            style={{
              background: "transparent", border: "none",
              color: "var(--hi-muted)", cursor: "pointer", padding: 4,
            }}
          >
            <HiIcon kind="logout" size={14} />
          </button>
        </div>
      </div>
    </aside>
  );
}

export function Topbar({
  title, subtitle, right,
}: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <header
      style={{
        display: "flex", alignItems: "center", gap: 16,
        padding: "18px 28px",
        borderBottom: "1px solid var(--hi-line)",
        background: "var(--hi-bg)",
        position: "sticky", top: 0, zIndex: 5,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <h1 style={{ fontSize: 19, fontWeight: 600, margin: 0, letterSpacing: -0.2, color: "var(--hi-ink)" }}>
          {title}
        </h1>
        {subtitle && <div style={{ fontSize: 12, color: "var(--hi-muted)", marginTop: 2 }}>{subtitle}</div>}
      </div>
      <div
        style={{
          display: "flex", alignItems: "center", gap: 8,
          background: "var(--hi-surface)",
          border: "1px solid var(--hi-line)",
          borderRadius: 8, padding: "6px 12px", width: 260,
        }}
      >
        <HiIcon kind="search" size={14} style={{ color: "var(--hi-muted)" }} />
        <span style={{ fontSize: 12.5, color: "var(--hi-muted)" }}>Suchen…</span>
        <span
          className="mono"
          style={{
            marginLeft: "auto", fontSize: 10, color: "var(--hi-muted)",
            padding: "1px 5px", background: "rgba(255,255,255,0.04)",
            borderRadius: 4, border: "1px solid var(--hi-line)",
          }}
        >
          ⌘K
        </span>
      </div>
      <button
        style={{
          width: 32, height: 32, borderRadius: 8,
          background: "var(--hi-surface)", border: "1px solid var(--hi-line)",
          color: "var(--hi-muted-strong)", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          position: "relative",
        }}
      >
        <HiIcon kind="bell" size={14} />
        <span style={{ position: "absolute", top: 6, right: 6, width: 7, height: 7, borderRadius: 4, background: "var(--hi-accent)" }} />
      </button>
      {right}
    </header>
  );
}

export function VoiceBanner({
  reservation, onConfirm, onDismiss,
}: {
  reservation: {
    id: string;
    guest_name: string;
    party_size: number;
    starts_at: string;
    note: string | null;
  };
  onConfirm?: () => void;
  onDismiss?: () => void;
}) {
  const when = new Date(reservation.starts_at);
  const time = when.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  const note = reservation.note ?? "";
  return (
    <div
      style={{
        margin: "16px 28px 0",
        background: "linear-gradient(90deg, color-mix(in oklch, var(--hi-accent) 16%, var(--hi-surface)), var(--hi-surface))",
        border: "1px solid color-mix(in oklch, var(--hi-accent) 40%, var(--hi-line))",
        borderRadius: 12, padding: "14px 18px",
        display: "flex", alignItems: "center", gap: 16,
        position: "relative", overflow: "hidden",
      }}
    >
      <div
        style={{
          width: 40, height: 40, borderRadius: 10,
          background: "var(--hi-accent)", color: "var(--hi-on-accent)",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0, position: "relative",
        }}
      >
        <HiIcon kind="voice" size={20} />
        <span
          style={{
            position: "absolute", inset: -4, borderRadius: 14,
            border: "2px solid var(--hi-accent)", opacity: 0.4,
            animation: "hi-pulse 2s infinite",
          }}
        />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--hi-ink)" }}>Neue Voice-KI Reservierung</span>
          <HiPill tone="accent" dot>Bestätigung erforderlich</HiPill>
        </div>
        <div style={{ fontSize: 12.5, color: "var(--hi-muted-strong)" }}>
          <strong style={{ color: "var(--hi-ink)", fontWeight: 500 }}>{reservation.guest_name}</strong>
          <span style={{ color: "var(--hi-muted)" }}>
            {" "}
            · {reservation.party_size} Personen · {time}
            {note ? ` · ${note}` : ""}
          </span>
        </div>
      </div>
      <HiBtn kind="ghost" size="sm" onClick={onDismiss}>Ablehnen</HiBtn>
      <HiBtn kind="primary" size="sm" icon="check" onClick={onConfirm}>
        Bestätigen &amp; Tisch zuweisen
      </HiBtn>
    </div>
  );
}
