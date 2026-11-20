import { NextResponse } from "next/server";
import { adjustQuantity, getItem } from "@/lib/db";
import { stockAlertWorsened } from "@/lib/email";
import { requireAdmin } from "@/lib/guard";
import { sendLowStockAlertsNow } from "@/lib/run-alerts";
import { stockStatus } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const { error } = await requireAdmin();
  if (error) return error;
  const { id } = await params;
  const body = await request.json();
  const delta = Number(body.delta);
  if (!Number.isFinite(delta) || delta === 0) {
    return NextResponse.json(
      { error: "delta must be a non-zero number" },
      { status: 400 }
    );
  }

  const before = await getItem(id);
  const item = await adjustQuantity(id, delta);
  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let alert = null;
  if (stockStatus(item) !== "ok") {
    const forceIds = stockAlertWorsened(before, item) ? [item.id] : [];
    // Await so Cloudflare doesn't kill the push after the response returns
    alert = await sendLowStockAlertsNow(false, forceIds).catch(() => null);
  }

  return NextResponse.json({ ...item, alert });
}
