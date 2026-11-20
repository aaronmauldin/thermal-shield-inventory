import { NextResponse } from "next/server";
import { checkoutMaterials, getItem, listCheckouts } from "@/lib/db";
import { assignedTruckIds } from "@/lib/auth";
import { stockAlertWorsened } from "@/lib/email";
import { requireAdmin, requireUser, forbidWrongTruck } from "@/lib/guard";
import { sendLowStockAlertsNow } from "@/lib/run-alerts";

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;
  const checkouts = await listCheckouts();
  return NextResponse.json(checkouts);
}

export async function POST(request: Request) {
  const { user, error } = await requireUser();
  if (error) return error;
  try {
    const body = await request.json();
    const assigned = assignedTruckIds(user || { truckIds: [] });
    const requested = String(body.truckId || "").trim() || null;
    const truckId =
      user?.role === "crew"
        ? requested && assigned.includes(requested)
          ? requested
          : assigned.length === 1
            ? assigned[0]
            : null
        : requested;
    const denied = forbidWrongTruck(user, truckId || requested);
    if (denied) return denied;
    const employeeName = String(body.employeeName || "");

    const lines = Array.isArray(body.lines)
      ? body.lines
      : body.itemId
        ? [{ itemId: body.itemId, quantity: body.quantity }]
        : [];

    const befores = await Promise.all(
      lines.map(async (line: { itemId: string }) => {
        const item = await getItem(String(line.itemId || ""));
        return item;
      })
    );
    const beforeById = new Map(
      befores.filter(Boolean).map((item) => [item!.id, item!])
    );

    const result = await checkoutMaterials({
      employeeName,
      truckId,
      lines,
    });

    const forceIds = result.items
      .filter((item) => stockAlertWorsened(beforeById.get(item.id), item))
      .map((item) => item.id);

    const needsAlert =
      forceIds.length > 0 ||
      result.items.some((item) => item.quantity <= item.lowStockThreshold);

    let alert = null;
    if (needsAlert) {
      alert = await sendLowStockAlertsNow(false, forceIds).catch(() => null);
    }

    return NextResponse.json({ ...result, alert }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Could not check out material",
      },
      { status: 400 }
    );
  }
}
