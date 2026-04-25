import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { notifyAsync } from "@/lib/notifications";

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const tenant = await getTenantContext();
  if (!tenant) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await ctx.params;
  const body = await request.json();

  // Vorher-Status holen, damit wir bei Storno-Uebergang die richtige Mail
  // ausloesen koennen — und nicht jedes harmlose UPDATE eine Mail triggert.
  const { data: prev } = await tenant.supabase
    .from("reservations").select("status")
    .eq("id", id).eq("restaurant_id", tenant.restaurantId).maybeSingle();

  const patch: Record<string, unknown> = {};
  for (const key of ["table_id", "guest_name", "phone", "email", "party_size", "starts_at", "duration_min", "status", "note", "auto_assigned", "approval_reason"] as const) {
    if (key in body) patch[key] = body[key];
  }
  // When the owner confirms, clear the approval flag and reason.
  if (body.status === "Bestätigt" && !("auto_assigned" in body)) {
    patch.auto_assigned = false;
    patch.approval_reason = null;
  }
  const { data, error } = await tenant.supabase
    .from("reservations").update(patch)
    .eq("id", id).eq("restaurant_id", tenant.restaurantId)
    .select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Email-Notify nur bei Statusuebergaengen die fuer das Team relevant sind
  const oldStatus = (prev as any)?.status;
  const newStatus = (data as any)?.status;
  if (oldStatus !== newStatus) {
    if (newStatus === "Storniert") {
      notifyAsync({ restaurantId: tenant.restaurantId, reservationId: id, kind: "cancelled" });
    } else if (newStatus === "Bestätigt" && oldStatus === "Angefragt") {
      // Manuelle Freigabe → Confirmation-Mail
      notifyAsync({ restaurantId: tenant.restaurantId, reservationId: id, kind: "confirmed" });
    }
  }

  return NextResponse.json(data);
}

export async function DELETE(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const tenant = await getTenantContext();
  if (!tenant) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await ctx.params;
  const { error } = await tenant.supabase
    .from("reservations").delete()
    .eq("id", id).eq("restaurant_id", tenant.restaurantId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
