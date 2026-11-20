import { NextResponse } from "next/server";
import { isStockDataMissing, STOCK_DATA_MISSING, STOCK_MISSING_CODE } from "./stock-missing";

export function stockMissingResponse(err: unknown): NextResponse | null {
  if (!isStockDataMissing(err)) return null;
  return NextResponse.json(
    { error: STOCK_DATA_MISSING, code: STOCK_MISSING_CODE },
    { status: 503 }
  );
}
