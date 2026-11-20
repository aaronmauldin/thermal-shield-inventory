export interface Category {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  category: string; // category id
  quantity: number;
  unit: string;
  unitCost: number;
  lowStockThreshold: number;
  location: string;
  notes: string;
  /** Compressed data-URL thumbnail */
  photo?: string | null;
  updatedAt: string;
  createdAt: string;
  lastAlertSentAt: string | null;
}

export interface TruckStockItem {
  itemId: string;
  itemName: string;
  unit: string;
  quantity: number;
}

export interface Truck {
  id: string;
  name: string;
  notes: string;
  /** Jobber Team names that should land jobs on this truck */
  jobberNames?: string[];
  stock: TruckStockItem[];
  createdAt: string;
  updatedAt: string;
}

export interface JobMaterial {
  itemId: string;
  itemName: string;
  quantity: number;
  unit: string;
}

export interface JobBagEntry {
  id: string;
  bags: number;
  employeeName: string;
  itemId: string;
  itemName: string;
  createdAt: string;
}

export interface JobRecord {
  id: string;
  name: string;
  location: string;
  notes: string;
  truckId: string | null;
  truckName: string;
  materials: JobMaterial[];
  bagCount: number;
  bagEntries: JobBagEntry[];
  /** @deprecated Kept for stored data; usage page no longer tracks money */
  amountCharged: number;
  /** @deprecated Kept for stored data; usage page no longer tracks money */
  materialCost: number;
  /** Jobber job id when this row was synced from a scheduled Jobber job */
  jobberJobId?: string | null;
  jobberVisitId?: string | null;
  /** Jobber visit/job start time */
  scheduledAt?: string | null;
  jobberAssignees?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface InsulationTallyEntry {
  id: string;
  bags: number;
  note: string;
  employeeName: string;
  truckId: string | null;
  truckName: string;
  createdAt: string;
}

export interface InsulationTally {
  totalBags: number;
  entries: InsulationTallyEntry[];
}

export interface CheckoutRecord {
  id: string;
  itemId: string;
  itemName: string;
  categoryId: string;
  quantity: number;
  unit: string;
  employeeName: string;
  truckId: string | null;
  truckName: string;
  quantityAfter: number;
  createdAt: string;
  /** Present on return / truck-to-truck records */
  kind?: "checkout" | "return" | "transfer";
}

export type UserRole = "admin" | "crew";

export interface AppUser {
  id: string;
  name: string;
  username: string;
  passwordHash: string;
  role: UserRole;
  /** True until they pick a password on first sign-in */
  mustSetPassword?: boolean;
  /** @deprecated Prefer truckIds. Kept as the first assigned truck. */
  truckId?: string | null;
  truckIds?: string[];
  createdAt: string;
}

export interface AuthSession {
  id: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
}

export interface AuthStore {
  users: AppUser[];
  sessions: AuthSession[];
}

export type PublicUser = {
  id: string;
  name: string;
  username: string;
  role: UserRole;
  mustSetPassword: boolean;
  truckId: string | null;
  truckIds: string[];
};

export interface AppSettings {
  alertEmail: string;
  companyName: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  smtpFrom: string;
  alertsEnabled: boolean;
}

/**
 * Maps a Jobber line-item name → inventory materials.
 * - per_line: need `quantity` of material per 1 Jobber line qty
 * - sqft_coverage: Jobber line qty is sqft; one material unit covers `coverageSqft`
 *   → bags = ceil(sqft / coverageSqft)
 */
export type TemplateCalcMode = "per_line" | "sqft_coverage";

export interface LineItemTemplateMaterial {
  itemId: string;
  itemName: string;
  unit: string;
  calcMode: TemplateCalcMode;
  /** Used when calcMode is per_line */
  quantity: number;
  /** Sqft covered by 1 unit when calcMode is sqft_coverage */
  coverageSqft: number;
}

export interface LineItemTemplate {
  id: string;
  /** Must match the Jobber line item name (case-insensitive). */
  name: string;
  notes: string;
  materials: LineItemTemplateMaterial[];
  createdAt: string;
  updatedAt: string;
}

export interface JobberConnection {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  accountId: string;
  accountName: string;
  connectedAt: string;
  lastJobSyncAt?: string;
}

export interface AppData {
  items: InventoryItem[];
  categories: Category[];
  checkouts: CheckoutRecord[];
  trucks: Truck[];
  jobs: JobRecord[];
  insulationTally: InsulationTally;
  lineItemTemplates: LineItemTemplate[];
  jobber: JobberConnection | null;
  settings: AppSettings;
}

export function normalizeLineName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export const DEFAULT_CATEGORY_SEED: { id: string; name: string }[] = [
  { id: "insulation", name: "Insulation" },
  { id: "caulk", name: "Caulk" },
  { id: "thermostat", name: "Thermostat" },
  { id: "fireblock", name: "Fireblock" },
  { id: "lightbulbs", name: "Lightbulbs" },
  { id: "other", name: "Other" },
];

export function stockStatus(item: InventoryItem): "ok" | "low" | "out" {
  if (item.quantity <= 0) return "out";
  if (item.quantity <= item.lowStockThreshold) return "low";
  return "ok";
}

export function categoryName(
  categories: Category[],
  categoryId: string
): string {
  return categories.find((c) => c.id === categoryId)?.name ?? categoryId;
}
