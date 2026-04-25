import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

// Self-hosted Google Fonts via next/font eliminates the render-blocking CSS
// request and preloads the font files. Fonts are inlined into the build and
// served from the same origin, so no extra TCP handshake.
const geist = Geist({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-geist",
  display: "swap",
});
const geistMono = Geist_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-geist-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "HostSystem", template: "%s · HostSystem" },
  description: "HostSystem — Voice-AI reservations, live floorplan and table management for restaurants. By CK GrowthSystems.",
  applicationName: "HostSystem",
  authors: [{ name: "CK GrowthSystems" }],
  keywords: ["restaurant", "reservations", "voice-ai", "table management", "hospitality", "saas"],
  // Favicon + Apple-Icon werden via app/icon.svg + app/apple-icon.svg auto-detected.
};

export const viewport: Viewport = {
  // Faerbt iOS Safari Adressleiste / Android Chrome Tab-Strip.
  themeColor: "#a8732f",
};

// Wird VOR dem React-Hydration ausgefuehrt — kein „Flash of Wrong Theme"
// und richtet die Soft-Copy-Schutz-Listener ein bevor der User klicken kann.
const themeBootstrap = `
(function () {
  try {
    var saved = localStorage.getItem('rhodos.theme');
    if (saved === 'light' || saved === 'dark') {
      document.documentElement.setAttribute('data-color-scheme', saved);
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
      document.documentElement.setAttribute('data-color-scheme', 'light');
    }
  } catch (e) {}

  // Soft-Copy-Schutz:
  // - Rechtsklick wird auf Body geblockt, Inputs/Textareas + .allow-select
  //   Elemente bleiben unangetastet (damit Wirt z.B. Buchungsnummer per
  //   rechter Maustaste -> Kopieren nehmen kann wenn das Element explizit
  //   freigegeben ist)
  // - Strg+P (Drucken) und F12 (DevTools) lassen wir bewusst frei — Drucken
  //   eines Tagesplans ist legitim, DevTools-Block ist eh wirkungslos
  document.addEventListener('contextmenu', function (e) {
    var t = e.target;
    if (t && t.closest && t.closest('input, textarea, select, [contenteditable], .allow-select')) return;
    e.preventDefault();
  });
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" data-theme="default" className={`${geist.variable} ${geistMono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
