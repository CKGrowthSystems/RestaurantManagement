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
  displayName, role, restaurantName, badges, restaurantId,
}: {
  displayName: string;
  role: string;
  restaurantName: string;
  badges?: Partial<Record<string, { n: number; tone?: "accent" | "neutral" }>>;
  restaurantId: string;
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
      {/* Kopf: Logo/Title + Collapse-Toggle */}
      <div style={{
        display: "flex", alignItems: "center",
        gap: 4,
        padding: collapsed ? "2px 2px 4px" : "4px 4px 6px",
        justifyContent: collapsed ? "center" : "space-between",
      }}>
        {collapsed ? (
          <BrandMark size={32} />
        ) : (
          <div style={{ flex: 1, minWidth: 0 }}>
            <EditableWordmark initial={restaurantName} />
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

/**
 * Sidebar-Wordmark mit Inline-Edit.
 * - Klick auf den Titel -> Input erscheint.
 * - Enter / Blur speichert ueber PATCH /api/settings (branding.public_name).
 * - Esc verwirft.
 * - Router-Refresh holt den neuen Wert aus dem Layout auf allen Seiten.
 */
function EditableWordmark({ initial }: { initial: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initial);
  const [savedValue, setSavedValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [hover, setHover] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setValue(initial); setSavedValue(initial); }, [initial]);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  async function commit() {
    const next = value.trim();
    if (!next || next === savedValue) { setEditing(false); setValue(savedValue); return; }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ branding: { public_name: next } }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg = String(body.error ?? `HTTP ${res.status}`);
        // Typischer Fall: branding-Spalte existiert nicht -> Migration 0005 fehlt
        if (msg.toLowerCase().includes("column") && msg.toLowerCase().includes("branding")) {
          throw new Error("DB-Migration 0005 fehlt: settings.branding existiert noch nicht in Supabase. Bitte supabase/migrations/0005_whitelabel_rotation_polygon.sql im SQL-Editor ausfuehren.");
        }
        throw new Error(msg);
      }
      setSavedValue(next);
      setEditing(false);
      router.refresh();
    } catch (err: any) {
      setError(err?.message ?? "Speichern fehlgeschlagen");
      // NICHT zumachen — User soll den Fehler sehen koennen und ggf. erneut versuchen
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    const dirty = value.trim() !== savedValue && value.trim().length > 0;
    return (
      <form
        onSubmit={(e) => { e.preventDefault(); commit(); }}
        style={{ display: "flex", flexDirection: "column", gap: 6 }}
      >
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") { setValue(savedValue); setEditing(false); }
          }}
          maxLength={40}
          style={{
            width: "100%",
            padding: "6px 8px",
            borderRadius: 6,
            border: `1px solid var(--hi-accent)`,
            background: "var(--hi-surface-raised)",
            color: "var(--hi-ink)",
            fontSize: 13, fontWeight: 600, letterSpacing: 1.5,
            outline: "none",
            fontFamily: "inherit",
          }}
          placeholder="Restaurantname"
          disabled={saving}
        />
        {error && (
          <div style={{
            fontSize: 10.5, lineHeight: 1.35,
            padding: "5px 7px", borderRadius: 5,
            background: "color-mix(in oklch, oklch(0.66 0.2 25) 12%, transparent)",
            color: "oklch(0.82 0.14 25)",
            border: "1px solid color-mix(in oklch, oklch(0.66 0.2 25) 35%, var(--hi-line))",
          }}>
            {error}
          </div>
        )}
        <div style={{ display: "flex", gap: 6 }}>
          <button
            type="submit"
            disabled={saving || !dirty}
            style={{
              flex: 1, padding: "5px 8px", borderRadius: 6,
              fontSize: 11, fontWeight: 600,
              border: "1px solid var(--hi-accent)",
              background: dirty ? "var(--hi-accent)" : "color-mix(in oklch, var(--hi-accent) 30%, var(--hi-surface))",
              color: dirty ? "var(--hi-on-accent)" : "var(--hi-muted)",
              cursor: dirty && !saving ? "pointer" : "not-allowed",
              display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4,
            }}
          >
            <HiIcon kind="check" size={11} />
            {saving ? "…" : "Speichern"}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => { setValue(savedValue); setEditing(false); }}
            style={{
              padding: "5px 8px", borderRadius: 6,
              fontSize: 11, fontWeight: 500,
              border: "1px solid var(--hi-line)",
              background: "transparent",
              color: "var(--hi-muted-strong)",
              cursor: "pointer",
              display: "inline-flex", alignItems: "center", gap: 4,
            }}
          >
            <HiIcon kind="x" size={10} /> Abbrechen
          </button>
        </div>
      </form>
    );
  }

  return (
    <div
      onClick={() => setEditing(true)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title="Klick zum Umbenennen"
      style={{
        cursor: "pointer", borderRadius: 7, padding: "2px 6px",
        margin: "-2px -6px",
        background: hover ? "rgba(255,255,255,0.05)" : "transparent",
        position: "relative",
        transition: "background 120ms ease",
      }}
    >
      <BrandWordmark name={savedValue.toUpperCase()} sub="" />
      {hover && (
        <span style={{
          position: "absolute", top: 4, right: 4,
          color: "var(--hi-muted)", display: "inline-flex",
        }}>
          <HiIcon kind="edit" size={11} />
        </span>
      )}
    </div>
  );
}
