"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import React, { useEffect, useRef, useState } from "react";
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
        <EditableWordmark initial={restaurantName} />
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
              className={`hi-nav-link${active ? " is-active" : ""}`}
              aria-current={active ? "page" : undefined}
            >
              <span className="hi-nav-icon" style={{ display: "inline-flex" }}>
                <HiIcon kind={n.icon} size={15} />
              </span>
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
      <RhodosWordmark name={savedValue.toUpperCase()} sub="TABLES" />
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
