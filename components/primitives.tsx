"use client";
import React from "react";

export type IconKind =
  | "grid" | "floor" | "table" | "clock" | "voice" | "chart" | "settings"
  | "search" | "bell" | "plus" | "check" | "arrow" | "user" | "phone"
  | "globe" | "logout" | "dot" | "walkin" | "edit" | "chevron" | "more"
  | "filter" | "export" | "link" | "copy" | "trash" | "x";

export function HiIcon({
  size = 16, kind = "grid", style, stroke = 1.5,
}: { size?: number; kind: IconKind; style?: React.CSSProperties; stroke?: number }) {
  const s = "currentColor";
  const paths: Record<IconKind, React.ReactNode> = {
    grid:     <g stroke={s} strokeWidth={stroke} fill="none" strokeLinecap="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></g>,
    floor:    <g stroke={s} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6l9-3 9 3v12l-9 3-9-3z"/><path d="M3 6l9 3 9-3M12 9v12"/></g>,
    table:    <g stroke={s} strokeWidth={stroke} fill="none" strokeLinecap="round"><circle cx="12" cy="12" r="6"/><path d="M12 6v-2M12 20v-2M6 12h-2M20 12h-2"/></g>,
    clock:    <g stroke={s} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/></g>,
    voice:    <g stroke={s} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11c0 3.9 3.1 7 7 7s7-3.1 7-7M12 18v3"/></g>,
    chart:    <g stroke={s} strokeWidth={stroke} fill="none" strokeLinecap="round"><path d="M3 20h18M6 16v-4M10 16V8M14 16v-7M18 16V5"/></g>,
    settings: <g stroke={s} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="2.5"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8"/></g>,
    search:   <g stroke={s} strokeWidth={stroke} fill="none" strokeLinecap="round"><circle cx="11" cy="11" r="6"/><path d="M16 16l4 4"/></g>,
    bell:     <g stroke={s} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M6 10a6 6 0 0 1 12 0v4l1.5 3h-15L6 14z"/><path d="M10 20a2 2 0 0 0 4 0"/></g>,
    plus:     <g stroke={s} strokeWidth={stroke} strokeLinecap="round"><path d="M12 5v14M5 12h14"/></g>,
    check:    <path d="M5 12l4.5 4.5L19 7" stroke={s} strokeWidth={stroke + 0.2} fill="none" strokeLinecap="round" strokeLinejoin="round"/>,
    arrow:    <path d="M5 12h14M13 6l6 6-6 6" stroke={s} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeLinejoin="round"/>,
    user:     <g stroke={s} strokeWidth={stroke} fill="none" strokeLinecap="round"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.5 3.1-6 7-6s7 2.5 7 6"/></g>,
    phone:    <path d="M6 3h3l1.5 4.5L8.5 9.5c1 2.2 2.8 4 5 5l2-2 4.5 1.5v3a2 2 0 0 1-2 2C9.6 19 4 13.4 4 5.5 4 4.1 5 3 6 3z" stroke={s} strokeWidth={stroke} fill="none" strokeLinejoin="round"/>,
    globe:    <g stroke={s} strokeWidth={stroke} fill="none"><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c3 3 3 14 0 17c-3-3-3-14 0-17z"/></g>,
    logout:   <g stroke={s} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M14 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2v-2"/><path d="M10 12h11M18 8l4 4-4 4"/></g>,
    dot:      <circle cx="12" cy="12" r="4" fill={s}/>,
    walkin:   <g stroke={s} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeLinejoin="round"><circle cx="13" cy="5" r="2"/><path d="M9 21l2-7-3-2 2-5 3 2 3 1M14 14l2 7M8 12l-2 3"/></g>,
    edit:     <g stroke={s} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20l1-4L17 4l3 3L8 19l-4 1z"/><path d="M14 7l3 3"/></g>,
    chevron:  <path d="M9 6l6 6-6 6" stroke={s} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeLinejoin="round"/>,
    more:     <g fill={s}><circle cx="6" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="18" cy="12" r="1.5"/></g>,
    filter:   <g stroke={s} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M3 5h18M6 12h12M10 19h4"/></g>,
    export:   <g stroke={s} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12M7 8l5-5 5 5"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></g>,
    link:     <g stroke={s} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></g>,
    copy:     <g stroke={s} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeLinejoin="round"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></g>,
    trash:    <g stroke={s} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13"/><path d="M10 11v7M14 11v7"/></g>,
    x:        <path d="M6 6l12 12M18 6L6 18" stroke={s} strokeWidth={stroke} fill="none" strokeLinecap="round"/>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" style={{ flexShrink: 0, ...style }}>{paths[kind] ?? paths.grid}</svg>;
}

/**
 * BrandMark — Logo des aktuellen Tenants (oder HostSystem-Default).
 * Reihenfolge:
 *   1. `src` Prop (z.B. tenant.logo_url aus settings.branding)
 *   2. /assets/rhodos-logo.png (Default-Asset das immer existiert)
 *
 * Trick gegen Broken-Image-Icon: Wir tracken errors in State und switchen
 * auf den Fallback. Vor dem Mount rendern wir nur die Fallback-URL,
 * sodass beim Reload kein 404 + Broken-Icon kurz aufflackern kann.
 */
export function BrandMark({
  size = 32,
  src,
  style,
}: {
  size?: number;
  src?: string | null;
  style?: React.CSSProperties;
}) {
  const FALLBACK = "/assets/rhodos-logo.png";
  const initialSrc = src && src.length > 0 ? src : FALLBACK;
  const [currentSrc, setCurrentSrc] = React.useState(initialSrc);
  const [errored, setErrored] = React.useState(false);

  // Wenn Eltern-Komponente einen neuen src reicht, neu probieren
  React.useEffect(() => {
    setCurrentSrc(src && src.length > 0 ? src : FALLBACK);
    setErrored(false);
  }, [src]);

  return (
    <img
      key={currentSrc}
      src={currentSrc}
      alt="Logo"
      width={size}
      height={size}
      onError={() => {
        if (!errored && currentSrc !== FALLBACK) {
          setErrored(true);
          setCurrentSrc(FALLBACK);
        }
      }}
      style={{
        display: "block",
        objectFit: "contain",
        // Verhindert das laesstige Broken-Image-Browser-Icon waehrend Lade-Versuchen
        // (Browser zeigt sonst je nach Engine ein graues Bilder-Symbol)
        backgroundColor: "transparent",
        ...style,
      }}
    />
  );
}

/** Backwards-compat Alias — Code-Stellen die noch RhodosMark importieren. */
export const RhodosMark = BrandMark;

/**
 * BrandWordmark — Produkt-Branding fuer pre-Tenant Pages (Login, Public).
 * In der Sidebar nach Login wird stattdessen der Restaurant-Name des
 * eingeloggten Kunden angezeigt (siehe EditableWordmark in shell.tsx).
 */
export function BrandWordmark({
  name = "HOSTSYSTEM",
  sub = "BY CK GROWTHSYSTEMS",
  logoSrc = null,
}: {
  name?: string;
  sub?: string;
  /** Optional Tenant-Logo-URL aus settings.branding.logo_url. */
  logoSrc?: string | null;
}) {
  // Adaptive sizing: laengere Namen werden etwas kleiner gerendert, damit sie
  // ohne Truncation in die 232px-Sidebar passen. Bei sehr langen Namen erlauben
  // wir Zeilenumbruch — der Name muss IMMER komplett sichtbar sein.
  const len = name.length;
  const fontSize = len <= 10 ? 14 : len <= 18 ? 12 : len <= 28 ? 11 : 10;
  const letterSpacing = len <= 10 ? 2.0 : len <= 18 ? 1.2 : 0.6;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, maxWidth: "100%" }}>
      <BrandMark size={32} src={logoSrc} style={{ flexShrink: 0 }} />
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1 }}>
        <span
          title={name}
          style={{
            fontSize, fontWeight: 600, letterSpacing,
            color: "var(--hi-ink)",
            // Mehrzeilig erlaubt — niemals abschneiden. word-break: break-word
            // damit auch ein einzelnes langes Wort zur Not umbricht.
            whiteSpace: "normal",
            wordBreak: "break-word",
            overflowWrap: "anywhere",
            lineHeight: 1.15,
          }}
        >
          {name}
        </span>
        {sub && (
          <span style={{
            fontSize: 8.5, letterSpacing: 1.8, marginTop: 4,
            color: "var(--hi-muted)", fontWeight: 500,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>{sub}</span>
        )}
      </div>
    </div>
  );
}

/** Backwards-compat Alias. */
export const RhodosWordmark = BrandWordmark;

export function HiCard({
  children, style, interactive, ...rest
}: React.HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div
      {...rest}
      style={{
        background: "var(--hi-surface)",
        border: "1px solid var(--hi-line)",
        borderRadius: 12,
        transition: "border-color .18s",
        ...(interactive && { cursor: "pointer" }),
        ...style,
      }}
    >
      {children}
    </div>
  );
}

type PillTone = "neutral" | "accent" | "success" | "warn" | "danger" | "info";
export function HiPill({
  children, tone = "neutral", dot, style,
}: { children: React.ReactNode; tone?: PillTone; dot?: boolean; style?: React.CSSProperties }) {
  const tones: Record<PillTone, { bg: string; fg: string; dot: string }> = {
    neutral: { bg: "rgba(255,255,255,0.05)", fg: "var(--hi-ink)", dot: "var(--hi-muted)" },
    accent:  { bg: "color-mix(in oklch, var(--hi-accent) 14%, transparent)", fg: "var(--hi-accent)", dot: "var(--hi-accent)" },
    success: { bg: "rgba(90, 170, 110, 0.12)", fg: "oklch(0.78 0.12 145)", dot: "oklch(0.7 0.15 145)" },
    warn:    { bg: "rgba(220, 150, 60, 0.14)", fg: "oklch(0.8 0.13 75)", dot: "oklch(0.75 0.16 70)" },
    danger:  { bg: "rgba(220, 90, 90, 0.14)", fg: "oklch(0.75 0.14 25)", dot: "oklch(0.7 0.16 25)" },
    info:    { bg: "rgba(120, 170, 220, 0.12)", fg: "oklch(0.78 0.1 235)", dot: "oklch(0.72 0.12 235)" },
  };
  const t = tones[tone];
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        padding: "3px 9px", borderRadius: 99,
        background: t.bg, color: t.fg,
        fontSize: 11, fontWeight: 500, whiteSpace: "nowrap",
        letterSpacing: 0.1, ...style,
      }}
    >
      {dot && <span style={{ width: 6, height: 6, borderRadius: 3, background: t.dot, flexShrink: 0 }} />}
      {children}
    </span>
  );
}

type BtnKind = "primary" | "secondary" | "ghost" | "outline" | "danger";
type BtnSize = "sm" | "md" | "lg";
export function HiBtn({
  children, kind = "secondary", size = "md", icon, style, ...rest
}: Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "size"> & {
  kind?: BtnKind; size?: BtnSize; icon?: IconKind;
}) {
  const sizes: Record<BtnSize, { padding: string; fontSize: number; gap: number; h: number }> = {
    sm: { padding: "5px 10px", fontSize: 11, gap: 5, h: 26 },
    md: { padding: "7px 14px", fontSize: 12.5, gap: 6, h: 32 },
    lg: { padding: "10px 18px", fontSize: 13.5, gap: 7, h: 40 },
  };
  const kinds: Record<BtnKind, React.CSSProperties> = {
    primary:   { background: "var(--hi-accent)", color: "var(--hi-on-accent)", border: "1px solid var(--hi-accent)" },
    secondary: { background: "var(--hi-surface-raised)", color: "var(--hi-ink)", border: "1px solid var(--hi-line)" },
    ghost:     { background: "transparent", color: "var(--hi-muted)", border: "1px solid transparent" },
    outline:   { background: "transparent", color: "var(--hi-ink)", border: "1px solid var(--hi-line)" },
    danger:    { background: "transparent", color: "oklch(0.75 0.14 25)", border: "1px solid oklch(0.4 0.1 25)" },
  };
  const s = sizes[size], k = kinds[kind];
  return (
    <button
      {...rest}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        borderRadius: 8, cursor: "pointer", fontWeight: 500,
        height: s.h, padding: s.padding, fontSize: s.fontSize, gap: s.gap,
        letterSpacing: 0.1, transition: "background .15s, border-color .15s, opacity .15s",
        ...k, ...style,
      }}
    >
      {icon && <HiIcon kind={icon} size={s.fontSize + 2} />}
      {children}
    </button>
  );
}

export function HiField({
  label, value, mono, onChange, type = "text", placeholder, style,
}: {
  label?: string;
  value?: string;
  mono?: boolean;
  onChange?: (v: string) => void;
  type?: string;
  placeholder?: string;
  style?: React.CSSProperties;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6, ...style }}>
      {label && (
        <span style={{ fontSize: 10.5, color: "var(--hi-muted)", fontWeight: 500, textTransform: "uppercase", letterSpacing: 0.8 }}>
          {label}
        </span>
      )}
      <input
        type={type}
        value={value ?? ""}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        style={{
          padding: "9px 12px",
          background: "var(--hi-surface-raised)",
          border: "1px solid var(--hi-line)",
          borderRadius: 8, fontSize: 13,
          fontFamily: mono ? '"Geist Mono", ui-monospace, monospace' : "inherit",
          color: "var(--hi-ink)", outline: "none",
          width: "100%",
        }}
      />
    </label>
  );
}

/**
 * HiSource zeigt die Herkunft einer Reservierung als Pill.
 *
 * Anzeige-Mapping (DB-Werte -> sichtbares Label):
 *   Voice-KI        -> „Voice-KI" (Telefon-Anruf ueber Voice-AI)
 *   Telefon/Chat    -> „Webseite" (Web-Chat-Agent auf der Homepage)
 *   Web / Walk-in / Manuell -> „Manuell" (vom Team haendisch eingetragen)
 *
 * Wir mappen auf DISPLAY-Ebene, damit alte Daten (DB-Werte „Telefon",
 * „Web", „Walk-in") weiter funktionieren — nur die UI wird vereinheitlicht.
 */
export function HiSource({ src }: { src: string }) {
  const m: Record<string, { icon: IconKind; tone: PillTone; label: string }> = {
    "Voice-KI":  { icon: "voice",  tone: "accent",  label: "Voice-KI" },
    "Voice":     { icon: "voice",  tone: "accent",  label: "Voice-KI" },
    "Telefon":   { icon: "globe",  tone: "info",    label: "Webseite" },
    "Webseite":  { icon: "globe",  tone: "info",    label: "Webseite" },
    "Chatagent": { icon: "globe",  tone: "info",    label: "Webseite" },
    "Web":       { icon: "edit",   tone: "neutral", label: "Manuell" },
    "Walk-in":   { icon: "edit",   tone: "neutral", label: "Manuell" },
    "Walk-In":   { icon: "edit",   tone: "neutral", label: "Manuell" },
    "Manuell":   { icon: "edit",   tone: "neutral", label: "Manuell" },
  };
  const x = m[src] ?? { icon: "edit" as IconKind, tone: "neutral" as PillTone, label: src };
  return (
    <HiPill tone={x.tone}>
      <HiIcon kind={x.icon} size={10.5} />
      {x.label}
    </HiPill>
  );
}

export type TableStatus = "free" | "reserved" | "seated" | "countdown";

const TABLE_STYLES: Record<TableStatus, { bg: string; border: string; fg: string; sub: string }> = {
  free:      { bg: "var(--hi-surface-raised)",                                                    border: "var(--hi-line-strong)",          fg: "var(--hi-ink)",              sub: "var(--hi-muted)" },
  reserved:  { bg: "color-mix(in oklch, var(--hi-accent) 18%, var(--hi-surface))",                border: "var(--hi-accent)",               fg: "var(--hi-accent)",           sub: "color-mix(in oklch, var(--hi-accent) 60%, var(--hi-ink))" },
  seated:    { bg: "color-mix(in oklch, oklch(0.7 0.12 145) 18%, var(--hi-surface))",             border: "oklch(0.68 0.13 145)",           fg: "oklch(0.82 0.14 145)",       sub: "oklch(0.72 0.12 145)" },
  countdown: { bg: "color-mix(in oklch, oklch(0.75 0.14 70) 20%, var(--hi-surface))",             border: "oklch(0.72 0.15 70)",            fg: "oklch(0.85 0.13 70)",        sub: "oklch(0.75 0.15 70)" },
};

/**
 * Liefert Grid-Layout für "zusammengestellte" Tische:
 *  2 Plätze → 1×1 (1 Einheit, einfacher Tisch)
 *  4 Plätze → 2×1 (2 Einheiten, doppelter Tisch)
 *  6 Plätze → 2×2 (4 Einheiten, 6 Gäste sitzen außen rum)
 *  8 Plätze → 3×2 (6 Einheiten)
 * 10 Plätze → 3×2 etwas breiter
 * 12+      → proportional
 */
function layoutForSeats(seats: number): { cols: number; rows: number } {
  if (seats <= 2)  return { cols: 1, rows: 1 };
  if (seats <= 4)  return { cols: 2, rows: 1 };
  if (seats <= 6)  return { cols: 2, rows: 2 };
  if (seats <= 8)  return { cols: 3, rows: 2 };
  if (seats <= 10) return { cols: 4, rows: 2 };
  return { cols: Math.ceil(seats / 3), rows: 2 };
}

export function HiTable({
  shape = "round", seats = 4, label = "T1", status = "free",
  size = 56, countdown, style, highlight, onClick, rotation = 0,
}: {
  shape?: "round" | "square"; seats?: number; label?: string;
  status?: TableStatus; size?: number; countdown?: string | null;
  style?: React.CSSProperties; highlight?: boolean; onClick?: () => void;
  rotation?: number;
}) {
  const s = TABLE_STYLES[status];
  const { cols, rows } = layoutForSeats(seats);

  // Einheitsgröße: Basis 1-Platz-Tisch ~ size × size
  const unitW = size;
  const unitH = size;
  const GAP = 2;
  const totalW = cols * unitW + (cols - 1) * GAP;
  const totalH = rows * unitH + (rows - 1) * GAP;

  const fontLabel = size > 54 ? 12 : 10;
  const fontSub   = size > 54 ? 10 : 9;

  return (
    <div
      onClick={onClick}
      style={{
        position: "relative",
        width: totalW, height: totalH,
        cursor: onClick ? "pointer" : "default",
        transition: "transform .12s",
        transform: rotation ? `rotate(${rotation}deg)` : undefined,
        transformOrigin: "center center",
        filter: highlight ? `drop-shadow(0 0 0 color-mix(in oklch, var(--hi-accent) 30%, transparent))` : undefined,
        ...style,
      }}
    >
      {Array.from({ length: rows }).map((_, r) =>
        Array.from({ length: cols }).map((__, c) => {
          // Label wird immer auf der oberen Reihe in der mittleren Spalte
          // gerendert. Alte Logik verlangte `isCenter && (isSingleRow || r === 0)`
          // was sich bei multi-row-Tischen (2x2, 3x2, ...) ausgeschlossen hat
          // und dazu fuehrte, dass z. B. 6p- und 8p-Tische keinen Namen zeigten.
          const labelCol = Math.floor((cols - 1) / 2);
          const isLabelCell = r === 0 && c === labelCol;
          const radius =
            shape === "round"
              ? (cols === 1 && rows === 1) ? "50%" : cornerRadius(c, r, cols, rows, "round")
              : cornerRadius(c, r, cols, rows, "square");
          return (
            <div key={`${r}-${c}`} style={{
              position: "absolute",
              left: c * (unitW + GAP),
              top:  r * (unitH + GAP),
              width: unitW, height: unitH,
              background: s.bg,
              border: `1.4px solid ${s.border}`,
              borderRadius: radius,
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              boxShadow: highlight ? "0 0 0 3px color-mix(in oklch, var(--hi-accent) 25%, transparent)" : "none",
              color: s.fg,
            }}>
              {isLabelCell && (
                <div
                  style={{
                    display: "flex", flexDirection: "column", alignItems: "center",
                    // Gegen-Rotation, damit Label + Seat-Count horizontal
                    // bleiben, auch wenn der Tisch rotiert ist.
                    transform: rotation ? `rotate(${-rotation}deg)` : undefined,
                    transformOrigin: "center center",
                  }}
                >
                  <span style={{ fontSize: fontLabel, fontWeight: 600, lineHeight: 1.1 }}>{label}</span>
                  <span style={{ fontSize: fontSub, opacity: 0.8, fontWeight: 400, color: s.sub, lineHeight: 1.1 }}>{seats}p</span>
                </div>
              )}
            </div>
          );
        }),
      )}
      {countdown && (
        <div
          className="mono"
          style={{
            position: "absolute", top: -8, right: -8,
            background: "oklch(0.75 0.15 70)", color: "#1a1209",
            fontSize: 10, fontWeight: 700,
            padding: "2px 7px", borderRadius: 10,
            letterSpacing: 0.3,
            // Badge soll unabhaengig von der Tisch-Rotation lesbar sein.
            transform: rotation ? `rotate(${-rotation}deg)` : undefined,
            transformOrigin: "center center",
          }}
        >
          {countdown}
        </div>
      )}
    </div>
  );
}

/** Verbindet Einheiten visuell: innenliegende Kanten kantenlos, Außenkanten gerundet. */
function cornerRadius(c: number, r: number, cols: number, rows: number, shape: "round" | "square"): string {
  if (cols === 1 && rows === 1) return shape === "round" ? "50%" : "10px";
  const outerRadius = shape === "round" ? "40%" : "10px";
  const tl = (c === 0          && r === 0)        ? outerRadius : "2px";
  const tr = (c === cols - 1   && r === 0)        ? outerRadius : "2px";
  const br = (c === cols - 1   && r === rows - 1) ? outerRadius : "2px";
  const bl = (c === 0          && r === rows - 1) ? outerRadius : "2px";
  return `${tl} ${tr} ${br} ${bl}`;
}
