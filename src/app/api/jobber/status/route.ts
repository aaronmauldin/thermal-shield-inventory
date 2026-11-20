import { NextResponse } from "next/server";
import { getJobberStatus } from "@/lib/db";
import { requireAdmin } from "@/lib/guard";
import { stockMissingResponse } from "@/lib/stock-missing-response";

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;
  try {
    return NextResponse.json(await getJobberStatus());
  } catch (err) {
    const missing = stockMissingResponse(err);
    if (missing) return missing;
    throw err;
  }
}
