"use client";
import { useState } from "react";
import { HiBtn } from "@/components/primitives";

export function CopyWebhookUrl({ secret }: { secret: string }) {
  const [done, setDone] = useState(false);
  async function copy() {
    const base = typeof window === "undefined" ? "" : window.location.origin;
    const payload = `Base URL: ${base}/api/v1/voice\nX-Webhook-Secret: ${secret}`;
    try {
      await navigator.clipboard.writeText(payload);
      setDone(true);
      setTimeout(() => setDone(false), 2000);
    } catch {
      // ignore
    }
  }
  return (
    <HiBtn kind="ghost" size="sm" icon={done ? "check" : "copy"} onClick={copy}>
      {done ? "Kopiert" : "Basis-URL + Secret kopieren"}
    </HiBtn>
  );
}
