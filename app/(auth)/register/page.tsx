"use client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { HiBtn, HiField } from "@/components/primitives";

export default function RegisterPage() {
  const router = useRouter();
  const [restaurant, setRestaurant] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError(null); setInfo(null);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: { restaurant_name: restaurant, display_name: name },
      },
    });
    setLoading(false);
    if (error) { setError(error.message); return; }
    if (data.session) {
      router.push("/dashboard"); router.refresh();
    } else {
      setInfo("Bitte bestätigen Sie Ihre E-Mail, dann können Sie sich anmelden.");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0, letterSpacing: -0.3 }}>Restaurant registrieren</h1>
        <p style={{ fontSize: 13, color: "var(--hi-muted)", marginTop: 4 }}>
          Legen Sie in 30 Sekunden einen neuen Mandanten inklusive Standard-Bereichen an.
        </p>
      </div>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <HiField label="Restaurantname" value={restaurant} onChange={setRestaurant} placeholder="Rhodos Ohlsbach" />
        <HiField label="Ihr Name" value={name} onChange={setName} placeholder="Giorgos A." />
        <HiField label="E-Mail" type="email" value={email} onChange={setEmail} placeholder="sie@restaurant.de" />
        <HiField label="Passwort" type="password" value={password} onChange={setPassword} placeholder="mind. 8 Zeichen" />
        {error && (
          <div style={{ fontSize: 12, color: "oklch(0.75 0.14 25)", padding: "8px 10px",
                        background: "rgba(220,90,90,0.1)", borderRadius: 8,
                        border: "1px solid rgba(220,90,90,0.3)" }}>
            {error}
          </div>
        )}
        {info && (
          <div style={{ fontSize: 12, color: "oklch(0.78 0.12 145)", padding: "8px 10px",
                        background: "rgba(90,170,110,0.1)", borderRadius: 8,
                        border: "1px solid rgba(90,170,110,0.3)" }}>
            {info}
          </div>
        )}
        <HiBtn kind="primary" size="lg" type="submit" disabled={loading}
               style={{ width: "100%", opacity: loading ? 0.6 : 1 }}>
          {loading ? "Anlegen…" : "Konto anlegen"}
        </HiBtn>
      </form>
      <div style={{ fontSize: 12.5, color: "var(--hi-muted)", textAlign: "center" }}>
        Schon registriert?{" "}
        <Link href="/login" style={{ color: "var(--hi-accent)", fontWeight: 500 }}>Anmelden</Link>
      </div>
    </div>
  );
}
