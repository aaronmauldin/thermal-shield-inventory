export const STOCK_DATA_MISSING = "Stock data is missing";
export const STOCK_MISSING_CODE = "stock_missing";

export class StockDataMissingError extends Error {
  readonly code = STOCK_MISSING_CODE;

  constructor() {
    super(STOCK_DATA_MISSING);
    this.name = "StockDataMissingError";
  }
}

export function isStockDataMissing(err: unknown): err is StockDataMissingError {
  return err instanceof StockDataMissingError || (err instanceof Error && err.name === "StockDataMissingError");
}
