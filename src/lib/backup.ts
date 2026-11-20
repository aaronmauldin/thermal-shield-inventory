import {
  readInventoryForBackup,
  replaceStoredInventory,
} from "./db";
import type { AppData } from "./types";

export const BACKUP_PRODUCT = "tsi-inv";
export const BACKUP_VERSION = 1;

export type InventoryBackup = {
  product: typeof BACKUP_PRODUCT;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  includesSecrets: false;
  omitted: string[];
  inventory: AppData;
};

const OMITTED = [
  "jobberTokens",
  "smtpPassword",
  "passwordHashes",
  "sessions",
  "pushSubscriptions",
];

export async function buildBackup(): Promise<InventoryBackup> {
  const inventory = await readInventoryForBackup();
  return {
    product: BACKUP_PRODUCT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    includesSecrets: false,
    omitted: OMITTED,
    inventory,
  };
}

export async function restoreBackup(raw: unknown) {
  if (!raw || typeof raw !== "object") {
    throw new Error("That file is not a TSI INV backup");
  }
  const body = raw as Partial<InventoryBackup>;
  if (body.product !== BACKUP_PRODUCT || body.version !== BACKUP_VERSION) {
    throw new Error("That file is not a TSI INV backup");
  }
  if (!body.inventory || typeof body.inventory !== "object") {
    throw new Error("Backup is missing inventory");
  }
  return replaceStoredInventory(body.inventory);
}
