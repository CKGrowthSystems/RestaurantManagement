import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { createAdminClient } from "@/lib/supabase/server";
import { extractText, getDocumentProxy } from "unpdf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BUCKET = "documents";
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_TEXT_CHARS = 80_000;       // Soft-Limit damit DB nicht aufgeblaeht wird

const VALID_TYPES = new Set(["menu", "allergens"]);

/**
 * POST /api/branding/document?type=menu|allergens
 * multipart/form-data — Feld „file" (PDF)
 *
 * Speichert ein PDF in Supabase Storage und extrahiert den Text fuer die
 * KI per `unpdf` (WASM-frei, Vercel-tauglich, robust). Schreibt
 * settings.calendar.{menu|allergens} = { pdf_url, pdf_filename, extracted_text, ... }.
 *
 * Bei gescannten / bildbasierten PDFs (kein eingebetteter Text) bleibt
 * extracted_text leer und der Wirt sollte den Text manuell ueber das
 * Fallback-Feld einpflegen.
 */
export async function POST(request: Request) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const url = new URL(request.url);
  const type = url.searchParams.get("type");
  if (!type || !VALID_TYPES.has(type)) {
    return NextResponse.json({ error: "Parameter 'type' muss 'menu' oder 'allergens' sein." }, { status: 400 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "Datei fehlt." }, { status: 400 });
  if (file.type !== "application/pdf") {
    return NextResponse.json({ error: `Nur PDF erlaubt (eingegebener Typ: ${file.type || "(unbekannt)"})` }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: `PDF zu gross (${(file.size / 1024 / 1024).toFixed(1)} MB). Max. 10 MB.` }, { status: 400 });
  }

  const admin = createAdminClient();

  // Bucket auto-create
  const { data: buckets } = await admin.storage.listBuckets();
  if (!buckets?.some((b) => b.name === BUCKET)) {
    const { error: createErr } = await admin.storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit: MAX_BYTES,
      allowedMimeTypes: ["application/pdf"],
    });
    if (createErr && !String(createErr.message).toLowerCase().includes("already")) {
      return NextResponse.json({ error: `Bucket-Erstellung fehlgeschlagen: ${createErr.message}` }, { status: 500 });
    }
  }

  const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) || "document.pdf";
  const path = `${ctx.restaurantId}/${type}-${Date.now()}.pdf`;

  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadErr } = await admin.storage.from(BUCKET).upload(path, buffer, {
    contentType: "application/pdf",
    cacheControl: "3600",
    upsert: false,
  });
  if (uploadErr) {
    return NextResponse.json({ error: `Upload fehlgeschlagen: ${uploadErr.message}` }, { status: 500 });
  }

  const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path);
  const publicUrl = pub.publicUrl;

  // Text-Extraktion
  let extractedText = "";
  let extractionWarning: string | null = null;
  try {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractText(pdf, { mergePages: true });
    extractedText = (Array.isArray(text) ? text.join("\n\n") : text).trim();
    if (extractedText.length === 0) {
      extractionWarning = "Aus dem PDF konnte kein Text extrahiert werden — wahrscheinlich ein Scan oder bildbasiert. Du kannst den Text unten manuell eintragen, damit die KI ihn nutzen kann.";
    }
    if (extractedText.length > MAX_TEXT_CHARS) {
      extractedText = extractedText.slice(0, MAX_TEXT_CHARS);
      extractionWarning = `Text gekürzt auf ${MAX_TEXT_CHARS} Zeichen. Falls relevante Inhalte am Ende fehlen, das PDF aufteilen oder Auszug einreichen.`;
    }
  } catch (err: any) {
    extractionWarning = `Text-Extraktion fehlgeschlagen: ${err?.message ?? "unbekannt"}. Bitte Text manuell unten eintragen.`;
  }

  const docRef = {
    pdf_url: publicUrl,
    pdf_filename: safeFilename,
    extracted_text: extractedText || null,
    char_count: extractedText.length,
    uploaded_at: new Date().toISOString(),
  };

  // settings.calendar.{type} aktualisieren — bestehende Felder erhalten
  const { data: existing } = await ctx.supabase
    .from("settings").select("calendar").eq("restaurant_id", ctx.restaurantId).maybeSingle();
  const newCalendar = { ...(existing?.calendar ?? {}), [type]: docRef };
  const { error: updErr } = await ctx.supabase
    .from("settings").update({ calendar: newCalendar }).eq("restaurant_id", ctx.restaurantId);
  if (updErr) {
    return NextResponse.json({ error: `Settings-Update fehlgeschlagen: ${updErr.message}` }, { status: 500 });
  }

  // Cleanup: alte Versionen entfernen, max 2 zurueckhalten
  try {
    const { data: list } = await admin.storage.from(BUCKET).list(ctx.restaurantId);
    const old = (list ?? [])
      .filter((f) => f.name.startsWith(`${type}-`) && f.name !== path.split("/").pop())
      .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))
      .slice(2);
    if (old.length > 0) {
      await admin.storage.from(BUCKET).remove(old.map((f) => `${ctx.restaurantId}/${f.name}`));
    }
  } catch { /* best-effort */ }

  return NextResponse.json({ ok: true, document: docRef, warning: extractionWarning });
}

/**
 * DELETE /api/branding/document?type=menu|allergens
 * Loescht das Dokument aus Storage + setzt das Feld auf null.
 */
export async function DELETE(request: Request) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const url = new URL(request.url);
  const type = url.searchParams.get("type");
  if (!type || !VALID_TYPES.has(type)) {
    return NextResponse.json({ error: "type fehlt oder ungueltig." }, { status: 400 });
  }

  const admin = createAdminClient();
  try {
    const { data: list } = await admin.storage.from(BUCKET).list(ctx.restaurantId);
    const matching = (list ?? []).filter((f) => f.name.startsWith(`${type}-`));
    if (matching.length > 0) {
      await admin.storage.from(BUCKET).remove(matching.map((f) => `${ctx.restaurantId}/${f.name}`));
    }
  } catch { /* best-effort */ }

  const { data: existing } = await ctx.supabase
    .from("settings").select("calendar").eq("restaurant_id", ctx.restaurantId).maybeSingle();
  const newCalendar = { ...(existing?.calendar ?? {}), [type]: null };
  await ctx.supabase
    .from("settings").update({ calendar: newCalendar }).eq("restaurant_id", ctx.restaurantId);

  return NextResponse.json({ ok: true });
}

/**
 * PATCH /api/branding/document?type=menu|allergens
 * Body: { manual_text: string }
 *
 * Ueberschreibt nur den manual_text-Override (z. B. wenn Wirt PDF-Extraction-
 * Mist nachbessern will oder gar kein PDF hochladen sondern einfach Text reinpflegen).
 */
export async function PATCH(request: Request) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const url = new URL(request.url);
  const type = url.searchParams.get("type");
  if (!type || !VALID_TYPES.has(type)) {
    return NextResponse.json({ error: "type fehlt oder ungueltig." }, { status: 400 });
  }
  const body = await request.json().catch(() => ({}));
  const manual = typeof body.manual_text === "string" ? body.manual_text.slice(0, MAX_TEXT_CHARS) : null;

  const { data: existing } = await ctx.supabase
    .from("settings").select("calendar").eq("restaurant_id", ctx.restaurantId).maybeSingle();
  const calendar = existing?.calendar ?? {};
  const current = calendar[type] ?? {};
  const updated = { ...current, manual_text: manual };
  const newCalendar = { ...calendar, [type]: updated };
  const { error } = await ctx.supabase
    .from("settings").update({ calendar: newCalendar }).eq("restaurant_id", ctx.restaurantId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true, document: updated });
}
