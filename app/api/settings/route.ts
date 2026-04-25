import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";

/**
 * Entfernt sensitive WhatsApp-Felder aus der Response. access_token bleibt
 * NIE im Plaintext in der API-Antwort, sodass das UI ihn nicht im DOM
 * darstellt und nicht in einer Server-Response-Cache landet.
 */
function redactWhatsAppForResponse(row: any): any {
  if (!row) return row;
  const wa = row.whatsapp;
  if (!wa || typeof wa !== "object") return row;
  const { access_token, ...rest } = wa;
  return {
    ...row,
    whatsapp: {
      ...rest,
      access_token_set: !!access_token,
    },
  };
}

export async function PATCH(request: Request) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const body = await request.json();

  // For jsonb columns (branding, notify, whatsapp) we merge with existing
  // values so that partial updates don't clobber other keys.
  let existing: any = null;
  if (body.branding !== undefined || body.notify !== undefined || body.whatsapp !== undefined) {
    const { data } = await ctx.supabase
      .from("settings")
      .select("branding, notify, whatsapp")
      .eq("restaurant_id", ctx.restaurantId)
      .maybeSingle();
    existing = data ?? null;
  }

  const patch: Record<string, unknown> = { restaurant_id: ctx.restaurantId };
  for (const key of ["release_mode", "release_minutes", "voice_prompt", "opening_hours"] as const) {
    if (key in body) patch[key] = body[key];
  }
  if ("branding" in body) {
    patch.branding = body.branding === null ? null : { ...(existing?.branding ?? {}), ...body.branding };
  }
  if ("notify" in body) {
    patch.notify = body.notify === null ? null : { ...(existing?.notify ?? {}), ...body.notify };
  }
  if ("whatsapp" in body) {
    if (body.whatsapp === null) {
      patch.whatsapp = null;
    } else {
      // Sicherheits-Pattern: leerer access_token im Body → bestehenden Token
      // BEHALTEN. So kann das UI die Settings updaten ohne den Token erneut
      // einzugeben (er wird sowieso nie zurueckgegeben).
      const incoming = { ...body.whatsapp };
      if (typeof incoming.access_token !== "string" || incoming.access_token.length === 0) {
        delete incoming.access_token;
      }
      patch.whatsapp = { ...(existing?.whatsapp ?? {}), ...incoming };
    }
  }
  // calendar wird im Ganzen ersetzt (closures/special_hours/announcements sind
  // Listen — der UI-Editor hat immer den vollstaendigen Stand). Damit verhindern
  // wir ein Merge-Chaos zwischen geloeschten und neuen Items.
  if ("calendar" in body) {
    patch.calendar = body.calendar ?? {};
  }

  const { data, error } = await ctx.supabase
    .from("settings").upsert(patch).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(redactWhatsAppForResponse(data));
}
