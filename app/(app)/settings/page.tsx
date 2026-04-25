import { redirect } from "next/navigation";
import { getTenantContext } from "@/lib/tenant";
import { Topbar } from "@/components/shell";
import { SettingsClient } from "./settings-client";
import type { Settings } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const ctx = await getTenantContext();
  if (!ctx) redirect("/login");
  const { supabase, restaurantId } = ctx;

  const { data: row } = await supabase.from("settings").select("*").eq("restaurant_id", restaurantId).maybeSingle();

  const settings: Settings = (row as Settings) ?? {
    restaurant_id: restaurantId,
    release_mode: "global",
    release_minutes: 15,
    opening_hours: {
      mo: { open: "17:00", close: "23:00" },
      tu: { open: "17:00", close: "23:00" },
      we: { open: "17:00", close: "23:00" },
      th: { open: "17:00", close: "23:00" },
      fr: { open: "17:00", close: "23:30" },
      sa: { open: "12:00", close: "23:30" },
      su: { open: "12:00", close: "22:00" },
    },
    voice_prompt: null,
    branding: null,
    notify: null,
    calendar: null,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>
      <Topbar title="Einstellungen" subtitle="Freigabe-Timer · Öffnungszeiten · Benachrichtigungen · Whitelabel · Benutzer" />
      <SettingsClient initial={settings} />
    </div>
  );
}
