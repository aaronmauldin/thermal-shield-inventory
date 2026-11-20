import { NextResponse } from "next/server";
import { createItem, listCategories, listItems } from "@/lib/db";
import { requireAdmin, requireUser } from "@/lib/guard";
import { triggerLowStockAlerts } from "@/lib/run-alerts";

export async function GET() {
  const { error } = await requireUser();
  if (error) return error;
  const items = await listItems();
  return NextResponse.json(items);
}

export async function POST(request: Request) {
  const { error } = await requireAdmin();
  if (error) return error;
  try {
    const body = await request.json();
    const name = String(body.name || "").trim();
    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const categories = await listCategories();
    const category =
      String(body.category || "").trim() || categories[0]?.id || "";
    if (!category) {
      return NextResponse.json(
        { error: "Add a category before creating items" },
        { status: 400 }
      );
    }

    const item = await createItem({
      name,
      category,
      quantity: Math.max(0, Number(body.quantity) || 0),
      unit: String(body.unit || "units").trim() || "units",
      unitCost: Math.max(0, Number(body.unitCost) || 0),
      lowStockThreshold: Math.max(0, Number(body.lowStockThreshold) || 0),
      location: String(body.location || "").trim(),
      notes: String(body.notes || "").trim(),
    });

    if (item.quantity <= item.lowStockThreshold) {
      await triggerLowStockAlerts(true);
    }

    return NextResponse.json(item, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not create item" },
      { status: 400 }
    );
  }
}
