"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { VoiceBanner } from "@/components/shell";
import type { Reservation } from "@/lib/types";

export function ConfirmVoiceForm({ reservation }: { reservation: Reservation }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function setStatus(status: "Bestätigt" | "Storniert") {
    setBusy(true);
    await fetch(`/api/reservations/${reservation.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setBusy(false);
    router.refresh();
  }

  if (busy) return null;
  return (
    <VoiceBanner
      reservation={reservation}
      onConfirm={() => setStatus("Bestätigt")}
      onDismiss={() => setStatus("Storniert")}
    />
  );
}
