"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { HiBtn, HiField } from "@/components/primitives";

export default function LoginPage() {
  return (
    <Suspense fallback={<div style={{ color: "var(--hi-muted)", fontSize: 13 }}>Lade…</div>}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/dashboard";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) { setError(error.message); return; }
    router.push(next);
    router.refresh();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0, letterSpacing: -0.3 }}>Anmelden</h1>
        <p style={{ fontSize: 13, color: "var(--hi-muted)", marginTop: 4 }}>
          Willkommen zurück. Melden Sie sich mit Ihrer E-Mail an.
        </p>
      </div>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <HiField label="E-Mail" type="email" value={email} onChange={setEmail} placeholder="sie@restaurant.de" />
        <HiField label="Passwort" type="password" value={password} onChange={setPassword} placeholder="••••••••" />
        {error && (
          <div style={{ fontSize: 12, color: "oklch(0.75 0.14 25)", padding: "8px 10px",
                        background: "rgba(220,90,90,0.1)", borderRadius: 8,
                        border: "1px solid rgba(220,90,90,0.3)" }}>
            {error}
          </div>
        )}
        <HiBtn kind="primary" size="lg" type="submit" disabled={loading}
               style={{ width: "100%", opacity: loading ? 0.6 : 1 }}>
          {loading ? "Anmelden…" : "Anmelden"}
        </HiBtn>
      </form>
      <div style={{ fontSize: 12, color: "var(--hi-muted)", textAlign: "center", lineHeight: 1.5 }}>
        Noch keinen Zugang? Dein Administrator legt Accounts an.
      </div>
    </div>
  );
}
