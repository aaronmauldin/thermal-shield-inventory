import { NextResponse } from "next/server";
import { sendLowStockAlerts } from "@/lib/email";
import { requireAdmin } from "@/lib/guard";

export async function POST(request: Request) {
  const { error } = await requireAdmin();
  if (error) return error;
  const body = await request.json().catch(() => ({}));
  const force = Boolean(body?.force);
  const result = await sendLowStockAlerts(force);
  return NextResponse.json(result);
}
