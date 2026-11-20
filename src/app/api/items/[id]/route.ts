import { NextResponse } from "next/server";
import { deleteItem, getItem, updateItem } from "@/lib/db";
import { stockAlertWorsened } from "@/lib/email";
import { requireAdmin, requireUser } from "@/lib/guard";
import { triggerLowStockAlerts } from "@/lib/run-alerts";
import { stockMissingResponse } from "@/lib/stock-missing-response";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { error } = await requireUser();
  if (error) return error;
  const { id } = await params;
  try {
    const item = await getItem(id);
    if (!item) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(item);
  } catch (err) {
    const missing = stockMissingResponse(err);
    if (missing) return missing;
    throw err;
  }
}

export async function PATCH(request: Request, { params }: Params) {
  const { error } = await requireAdmin();
  if (error) return error;
  try {
    const { id } = await params;
    const body = await request.json();
    const before = await getItem(id);

    const patch: Record<string, unknown> = {};
    if (body.name !== undefined) patch.name = String(body.name).trim();
    if (body.category !== undefined) patch.category = String(body.category).trim();
    if (body.quantity !== undefined) {
      patch.quantity = Math.max(0, Number(body.quantity) || 0);
    }
    if (body.unit !== undefined) patch.unit = String(body.unit).trim() || "units";
    if (body.unitCost !== undefined) {
      patch.unitCost = Math.max(0, Number(body.unitCost) || 0);
    }
    if (body.lowStockThreshold !== undefined) {
      patch.lowStockThreshold = Math.max(0, Number(body.lowStockThreshold) || 0);
    }
    if (body.location !== undefined) patch.location = String(body.location).trim();
    if (body.notes !== undefined) patch.notes = String(body.notes).trim();
    if (body.photo !== undefined) {
      patch.photo = body.photo === null || body.photo === "" ? null : String(body.photo);
    }

    const item = await updateItem(id, patch);
    if (!item) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const photoOnly =
      Object.keys(patch).length === 1 && patch.photo !== undefined;
    if (!photoOnly && item.quantity <= item.lowStockThreshold) {
      const forceIds = stockAlertWorsened(before, item) ? [item.id] : [];
      await triggerLowStockAlerts(false, forceIds);
    }

    return NextResponse.json(item);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not update item" },
      { status: 400 }
    );
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { error } = await requireAdmin();
  if (error) return error;
  const { id } = await params;
  const ok = await deleteItem(id);
  if (!ok) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
