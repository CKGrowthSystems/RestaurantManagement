"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import React, { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { HiBtn, HiIcon, HiPill, BrandMark, BrandWordmark, type IconKind } from "./primitives";
import { useRealtimeCount } from "@/lib/supabase/realtime";

const SIDEBAR_COLLAPSED_KEY = "rhodos.sidebar.collapsed";
const SIDEBAR_W_EXPANDED = 232;
const SIDEBAR_W_COLLAPSED = 62;

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
  displayName, role, restaurantName, badges, restaurantId, logoUrl = null,
}: {
  displayName: string;
  role: string;
  restaurantName: string;
  badges?: Partial<Record<string, { n: number; tone?: "accent" | "neutral" }>>;
  restaurantId: string;
  /** Tenant-Logo aus settings.branding.logo_url. Wenn null/leer, wird das Default-Asset gezeigt. */
  logoUrl?: string | null;
}) {
  const pathname = usePathname() || "";
  const router = useRouter();
  const initials = displayName.slice(0, 2).toUpperCase();

  // Live-Zahlen: Reservierungen-Badge zaehlt Anfragen, die auf Freigabe warten
  // (Stammtisch/VIP) — das sind die Dinge, die dringend Aufmerksamkeit brauchen.
  const pendingApprovals = useRealtimeCount("reservations", restaurantId, badges?.reservations?.n ?? 0, {
    filter: (q) => q.eq("status", "Angefragt"),
    additionalFilterString: "status=Angefragt",
  });
  const voiceCallsToday = useRealtimeCount("voice_calls", restaurantId, badges?.voice?.n ?? 0, {
    filter: (q) => q.gte("started_at", new Date(Date.now() - 24 * 3600_000).toISOString()),
    additionalFilterString: "last-24h",
  });

  const liveBadges: typeof badges = {
    ...badges,
    // Warn-Tone (orange) fuer Angefragt — signalisiert dringendes Handeln
    reservations: { n: pendingApprovals, tone: pendingApprovals > 0 ? "accent" : badges?.reservations?.tone },
    voice: { n: voiceCallsToday, tone: badges?.voice?.tone ?? "accent" },
  };

  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  // Collapse-State: Nutzerpraeferenz in localStorage. Bei sehr schmalen
  // Bildschirmen (Tablet Querformat) wird automatisch zu collapsed
  // gewechselt, solange der Nutzer nicht explizit aufgeklappt hat
  // (Preference "expand" ueberschreibt das Auto-Collapse).
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem(SIDEBAR_COLLAPSED_KEY) : null;
    // saved can be: "1" (collapsed), "0" (expanded), null (no pref yet)
    if (saved === "1") setCollapsed(true);
    else if (saved === "0") setCollapsed(false);
    else if (typeof window !== "undefined" && window.innerWidth < 1200) setCollapsed(true);

    const onResize = () => {
      const pref = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
      if (pref !== null) return; // user set it — respect
      setCollapsed(window.innerWidth < 1200);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0"); } catch {}
  }

  const width = collapsed ? SIDEBAR_W_COLLAPSED : SIDEBAR_W_EXPANDED;

  return (
    <aside
      data-collapsed={collapsed ? "true" : "false"}
      style={{
        width, flexShrink: 0,
        background: "var(--hi-bg)",
        borderRight: "1px solid var(--hi-line)",
        display: "flex", flexDirection: "column",
        padding: collapsed ? "14px 8px" : "20px 14px",
        height: "100vh", position: "sticky", top: 0,
        transition: "width 180ms ease, padding 180ms ease",
      }}
    >
      {/* Kopf: Logo/Title + Collapse-Toggle.
          Mehr horizontaler Abstand zwischen Wordmark + Edit-Stift + Collapse-Button,
          damit man die Buttons nicht versehentlich aufeinander trifft (Touch + Maus). */}
      <div style={{
        display: "flex", alignItems: "center",
        gap: 12,
        padding: collapsed ? "2px 2px 4px" : "4px 4px 6px",
        justifyContent: collapsed ? "center" : "space-between",
        marginBottom: 4,
      }}>
        {collapsed ? (
          <BrandMark size={32} src={logoUrl} />
        ) : (
          <div style={{ flex: 1, minWidth: 0, paddingRight: 4 }}>
            <EditableWordmark initial={restaurantName} logoUrl={logoUrl} />
          </div>
        )}
        <button
          onClick={toggleCollapsed}
          title={collapsed ? "Menü ausklappen" : "Menü einklappen"}
          aria-label={collapsed ? "Menü ausklappen" : "Menü einklappen"}
          style={{
            width: 26, height: 26, borderRadius: 6,
            background: "var(--hi-surface)",
            border: "1px solid var(--hi-line)",
            color: "var(--hi-muted-strong)",
            cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
            position: collapsed ? "absolute" : "static",
            top: collapsed ? 42 : undefined,
            right: collapsed ? -13 : undefined,
            zIndex: collapsed ? 3 : undefined,
          }}
        >
          <HiIcon kind="chevron" size={12} style={{ transform: collapsed ? undefined : "rotate(180deg)" }} />
        </button>
      </div>
      {!collapsed && (
        <div
          style={{
            fontSize: 10, color: "var(--hi-muted)", letterSpacing: 1.2,
            padding: "18px 10px 8px", fontWeight: 600,
          }}
        >
          NAVIGATION
        </div>
      )}
      {collapsed && <div style={{ height: 14 }} />}
      <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {NAV.map((n) => {
          const active = pathname === n.href || pathname.startsWith(n.href + "/");
          const badge = liveBadges?.[n.id];
          return (
            <Link
              key={n.id}
              href={n.href}
              className={`hi-nav-link${active ? " is-active" : ""}${collapsed ? " is-compact" : ""}`}
              aria-current={active ? "page" : undefined}
              title={collapsed ? n.label : undefined}
              style={collapsed ? { padding: "9px 0", justifyContent: "center", position: "relative" } : undefined}
            >
              <span className="hi-nav-icon" style={{ display: "inline-flex" }}>
                <HiIcon kind={n.icon} size={16} />
              </span>
              {!collapsed && <span style={{ flex: 1 }}>{n.label}</span>}
              {badge && badge.n > 0 && (
                <span
                  className="mono"
                  style={
                    collapsed
                      ? {
                          position: "absolute", top: 4, right: 6,
                          minWidth: 14, height: 14, padding: "0 4px", borderRadius: 7,
                          fontSize: 9, fontWeight: 700, lineHeight: "14px", textAlign: "center",
                          background: badge.tone === "accent" ? "var(--hi-accent)" : "var(--hi-line-strong)",
                          color: badge.tone === "accent" ? "var(--hi-on-accent)" : "var(--hi-ink)",
                        }
                      : {
                          fontSize: 10, fontWeight: 600,
                          padding: "1px 6px", borderRadius: 9,
                          background:
                            badge.tone === "accent"
                              ? "color-mix(in oklch, var(--hi-accent) 18%, transparent)"
                              : "rgba(255,255,255,0.07)",
                          color: badge.tone === "accent" ? "var(--hi-accent)" : "var(--hi-muted-strong)",
                        }
                  }
                >
                  {badge.n}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      <div style={{ marginTop: "auto" }}>
        {collapsed ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <div
              title={`${displayName} · ${role}`}
              style={{
                width: 34, height: 34, borderRadius: 8,
                background: "color-mix(in oklch, var(--hi-accent) 20%, var(--hi-surface))",
                color: "var(--hi-accent)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 12, fontWeight: 600,
              }}
            >
              {initials}
            </div>
            <button
              onClick={logout}
              title="Abmelden"
              style={{
                width: 34, height: 30, borderRadius: 7,
                background: "var(--hi-surface)", border: "1px solid var(--hi-line)",
                color: "var(--hi-muted)", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <HiIcon kind="logout" size={13} />
            </button>
          </div>
        ) : (
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
        )}
      </div>
    </aside>
  );
}

export function Topbar({
  title, subtitle, right,
}: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <header
      className="hi-topbar"
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
      <ThemeToggle />
      {right}
    </header>
  );
}

/**
 * Light/Dark-Toggle. State liegt in localStorage, wird beim Mount von der
 * Inline-Skript-Funktion (siehe app/layout.tsx) bereits ohne Flash gesetzt.
 * Hier nur das UI fuer das Toggling.
 */
function ThemeToggle() {
  const [scheme, setScheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const current = (typeof document !== "undefined"
      ? document.documentElement.getAttribute("data-color-scheme")
      : null) as "dark" | "light" | null;
    if (current === "light" || current === "dark") setScheme(current);
  }, []);

  function toggle() {
    const next = scheme === "dark" ? "light" : "dark";
    setScheme(next);
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-color-scheme", next);
    }
    try { localStorage.setItem("rhodos.theme", next); } catch {}
  }

  const isLight = scheme === "light";
  return (
    <button
      onClick={toggle}
      title={isLight ? "Auf Dunkel-Modus wechseln" : "Auf Hell-Modus wechseln"}
      aria-label="Theme wechseln"
      style={{
        width: 32, height: 32, borderRadius: 8,
        background: "var(--hi-surface)",
        border: "1px solid var(--hi-line)",
        color: "var(--hi-muted-strong)",
        cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
      }}
    >
      {isLight ? (
        // Mond (zeigt: aktuell hell, wechselt zu dunkel)
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      ) : (
        // Sonne (zeigt: aktuell dunkel, wechselt zu hell)
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      )}
    </button>
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

/**
 * Sidebar-Wordmark — read-only.
 * Der Restaurant-Name wird ausschliesslich ueber Settings → Branding →
 * „Oeffentlicher Name" gepflegt. Hier nur Anzeige + Klick fuehrt direkt
 * in die Branding-Settings, falls der Wirt anpassen will.
 */
function EditableWordmark({ initial, logoUrl = null }: { initial: string; logoUrl?: string | null }) {
  return (
    <Link
      href="/settings"
      title="Name in den Einstellungen unter Branding ändern"
      style={{
        textDecoration: "none",
        cursor: "pointer", borderRadius: 7, padding: "2px 6px",
        margin: "-2px -6px",
        background: "transparent",
        transition: "background 120ms ease",
        display: "block",
      }}
      className="hi-nav-link-bare"
    >
      <BrandWordmark name={initial.toUpperCase()} sub="HOSTSYSTEM" logoSrc={logoUrl} />
    </Link>
  );
}
