import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BUCKET = "logos";
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const ALLOWED = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/svg+xml",
  "image/webp",
]);

/**
 * POST /api/branding/logo
 * multipart/form-data — Feld „file"
 *
 * Speichert das Tenant-Logo in Supabase Storage (Bucket „logos") unter
 * <restaurant_id>/<timestamp>.<ext> und schreibt die public URL in
 * settings.branding.logo_url. Bucket wird auto-erstellt falls noch nicht da.
 *
 * Sicherheit:
 *  - Nur authentifizierte Tenant-Member duerfen ihr eigenes Logo aendern
 *  - Dateigroesse hart auf 2 MB limitiert
 *  - MIME-Type whitelisted
 *  - Pfad immer mit restaurant_id gepraefixt → keine Cross-Tenant-Schreibrechte
 */
export async function POST(request: Request) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "Datei fehlt." }, { status: 400 });
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json({ error: `Dateityp ${file.type || "(unbekannt)"} nicht erlaubt. PNG, JPG, SVG oder WebP.` }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: `Datei zu gross (${(file.size / 1024 / 1024).toFixed(1)} MB). Max. 2 MB.` }, { status: 400 });
  }

  // Admin-Client fuer Storage (bucket auto-create + Upload)
  const admin = createAdminClient();

  // Bucket auto-create (idempotent)
  const { data: buckets } = await admin.storage.listBuckets();
  if (!buckets?.some((b) => b.name === BUCKET)) {
    const { error: createErr } = await admin.storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit: MAX_BYTES,
      allowedMimeTypes: Array.from(ALLOWED),
    });
    if (createErr && !String(createErr.message).toLowerCase().includes("already")) {
      return NextResponse.json({ error: `Bucket-Erstellung fehlgeschlagen: ${createErr.message}` }, { status: 500 });
    }
  }

  // Datei-Endung aus MIME ableiten — sicherer als user-Filename
  const extByMime: Record<string, string> = {
    "image/png": "png", "image/jpeg": "jpg", "image/jpg": "jpg",
    "image/svg+xml": "svg", "image/webp": "webp",
  };
  const ext = extByMime[file.type] ?? "bin";
  // Pfad: <restaurant_id>/logo-<timestamp>.<ext>
  const path = `${ctx.restaurantId}/logo-${Date.now()}.${ext}`;

  // Upload (overwrite=true sodass der Upload an die Stelle die alte Datei
  // ersetzt — wir benutzen aber timestamp-Pfade, also kollidiert nichts)
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadErr } = await admin.storage.from(BUCKET).upload(path, buffer, {
    contentType: file.type,
    cacheControl: "3600",
    upsert: false,
  });
  if (uploadErr) {
    return NextResponse.json({ error: `Upload fehlgeschlagen: ${uploadErr.message}` }, { status: 500 });
  }

  const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path);
  const publicUrl = pub.publicUrl;

  // settings.branding.logo_url aktualisieren — bestehende branding-Felder erhalten
  const { data: existing } = await ctx.supabase
    .from("settings").select("branding").eq("restaurant_id", ctx.restaurantId).maybeSingle();
  const newBranding = { ...(existing?.branding ?? {}), logo_url: publicUrl };
  const { error: updateErr } = await ctx.supabase
    .from("settings").update({ branding: newBranding }).eq("restaurant_id", ctx.restaurantId);
  if (updateErr) {
    return NextResponse.json({ error: `Settings-Update fehlgeschlagen: ${updateErr.message}` }, { status: 500 });
  }

  // Alte Logos aufraeumen (nur die letzten 3 behalten)
  try {
    const { data: list } = await admin.storage.from(BUCKET).list(ctx.restaurantId);
    const old = (list ?? [])
      .filter((f) => f.name !== path.split("/").pop())
      .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))
      .slice(2);
    if (old.length > 0) {
      await admin.storage.from(BUCKET).remove(old.map((f) => `${ctx.restaurantId}/${f.name}`));
    }
  } catch { /* cleanup is best-effort */ }

  return NextResponse.json({ ok: true, logo_url: publicUrl });
}

/**
 * DELETE /api/branding/logo — Logo entfernen.
 */
export async function DELETE() {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const admin = createAdminClient();
  // Alle Tenant-Logos entfernen
  const { data: list } = await admin.storage.from(BUCKET).list(ctx.restaurantId).catch(() => ({ data: [] }));
  if (list && list.length > 0) {
    await admin.storage.from(BUCKET).remove(list.map((f) => `${ctx.restaurantId}/${f.name}`));
  }

  // settings.branding.logo_url auf null setzen
  const { data: existing } = await ctx.supabase
    .from("settings").select("branding").eq("restaurant_id", ctx.restaurantId).maybeSingle();
  const newBranding = { ...(existing?.branding ?? {}), logo_url: null };
  await ctx.supabase
    .from("settings").update({ branding: newBranding }).eq("restaurant_id", ctx.restaurantId);

  return NextResponse.json({ ok: true });
}
