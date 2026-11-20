import { randomUUID } from "crypto";
import { loadRawData, saveRawData } from "./storage";
import {
  DEFAULT_CATEGORY_SEED,
  type AppData,
  type AppSettings,
  type Category,
  type CheckoutRecord,
  type InsulationTally,
  type InsulationTallyEntry,
  type InventoryItem,
  type JobBagEntry,
  type JobberConnection,
  type JobMaterial,
  type JobRecord,
  type LineItemTemplate,
  type LineItemTemplateMaterial,
  type TemplateCalcMode,
  type Truck,
  type TruckStockItem,
} from "./types";
import { compareJobsBySchedule, formatYmdInZone, parseJobberNameList } from "./jobSort";
import { applyDemoUsageJobs } from "./demoUsage";
import { StockDataMissingError } from "./stock-missing";

const defaultSettings: AppSettings = {
  alertEmail: "",
  companyName: "TSI INV",
  smtpHost: process.env.SMTP_HOST || "",
  smtpPort: Number(process.env.SMTP_PORT || 587),
  smtpUser: process.env.SMTP_USER || "",
  smtpPass: process.env.SMTP_PASS || "",
  smtpFrom: process.env.SMTP_FROM || "",
  alertsEnabled: true,
};

function nowIso() {
  return new Date().toISOString();
}

/** Truck/job material qty — supports partial tubes (0.25, 0.5, 0.75). */
function roundQty(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

function buildDefaultCategories(stamped = nowIso()): Category[] {
  return DEFAULT_CATEGORY_SEED.map((c) => ({
    id: c.id,
    name: c.name,
    createdAt: stamped,
    updatedAt: stamped,
  }));
}

const seedItems: Omit<
  InventoryItem,
  "id" | "createdAt" | "updatedAt" | "lastAlertSentAt"
>[] = [
  {
    name: "R-38 Fiberglass Batts",
    category: "insulation",
    quantity: 24,
    unit: "bags",
    unitCost: 0,
    lowStockThreshold: 8,
    location: "Truck A / Bay 1",
    notes: "Attic installs",
  },
  {
    name: "Open-cell Spray Foam",
    category: "insulation",
    quantity: 6,
    unit: "kits",
    unitCost: 0,
    lowStockThreshold: 4,
    location: "Warehouse shelf B",
    notes: "",
  },
  {
    name: "Clear Siliconized Acrylic",
    category: "caulk",
    quantity: 18,
    unit: "tubes",
    unitCost: 0,
    lowStockThreshold: 10,
    location: "Van tote",
    notes: "Window & door sealing",
  },
  {
    name: "Paintable Latex Caulk",
    category: "caulk",
    quantity: 4,
    unit: "tubes",
    unitCost: 0,
    lowStockThreshold: 6,
    location: "Van tote",
    notes: "Low stock — reorder",
  },
  {
    name: "Wi-Fi Smart Thermostat",
    category: "thermostat",
    quantity: 5,
    unit: "units",
    unitCost: 0,
    lowStockThreshold: 3,
    location: "Office cabinet",
    notes: "",
  },
  {
    name: "Fireblock Foam Sealant",
    category: "fireblock",
    quantity: 2,
    unit: "cans",
    unitCost: 0,
    lowStockThreshold: 4,
    location: "Truck A / Bay 3",
    notes: "Code jobs",
  },
  {
    name: "LED A19 60W Equivalent",
    category: "lightbulbs",
    quantity: 36,
    unit: "bulbs",
    unitCost: 0,
    lowStockThreshold: 12,
    location: "Warehouse bin L",
    notes: "Soft white",
  },
  {
    name: "LED BR30 Flood",
    category: "lightbulbs",
    quantity: 0,
    unit: "bulbs",
    unitCost: 0,
    lowStockThreshold: 8,
    location: "Warehouse bin L",
    notes: "Out of stock",
  },
];

function emptyTally(): InsulationTally {
  return { totalBags: 0, entries: [] };
}

function sanitizeItemPhoto(value: unknown): string | undefined {
  if (value === null || value === "") return undefined;
  if (typeof value !== "string") return undefined;
  if (!value.startsWith("data:image/")) return undefined;
  if (value.length > 120_000) {
    throw new Error("Photo is too large — try a smaller picture");
  }
  return value;
}

function normalizeData(raw: Partial<AppData>): AppData {
  const stamped = nowIso();
  const settings = { ...defaultSettings, ...(raw.settings || {}) };
  const items = (Array.isArray(raw.items) ? raw.items : []).map((item) => {
    const photoRaw = (item as InventoryItem).photo;
    const photo =
      typeof photoRaw === "string" &&
      photoRaw.startsWith("data:image/") &&
      photoRaw.length <= 120_000
        ? photoRaw
        : undefined;
    return {
      ...item,
      photo,
      unitCost:
        typeof (item as InventoryItem).unitCost === "number" &&
        Number.isFinite((item as InventoryItem).unitCost)
          ? Math.max(0, (item as InventoryItem).unitCost)
          : 0,
    };
  });
  const checkouts = (Array.isArray(raw.checkouts) ? raw.checkouts : []).map(
    (c) => ({
      ...c,
      truckId: c.truckId ?? null,
      truckName: c.truckName ?? "",
      kind: (
        c.kind === "return"
          ? "return"
          : c.kind === "transfer"
            ? "transfer"
            : "checkout"
      ) as "checkout" | "return" | "transfer",
    })
  );
  const jobs = (Array.isArray(raw.jobs) ? raw.jobs : []).map((job) => ({
    ...job,
    bagCount: typeof job.bagCount === "number" ? job.bagCount : 0,
    bagEntries: Array.isArray(job.bagEntries) ? job.bagEntries : [],
    amountCharged:
      typeof (job as JobRecord).amountCharged === "number" &&
      Number.isFinite((job as JobRecord).amountCharged)
        ? Math.max(0, (job as JobRecord).amountCharged)
        : 0,
    materialCost:
      typeof (job as JobRecord).materialCost === "number" &&
      Number.isFinite((job as JobRecord).materialCost)
        ? Math.max(0, (job as JobRecord).materialCost)
        : 0,
  }));
  let trucks = (Array.isArray(raw.trucks) ? [...raw.trucks] : []).map((truck) => {
    const jobberNames = parseJobberNameList(truck.jobberNames);
    if (
      /\btruck\s*#?\s*3\b/i.test(truck.name) &&
      !jobberNames.some((name) => name.toLowerCase().includes("zack"))
    ) {
      jobberNames.push("Zack's Crew");
    }
    return { ...truck, jobberNames };
  });
  const rawEntries = Array.isArray(raw.insulationTally?.entries)
    ? raw.insulationTally!.entries
    : [];
  const insulationTally =
    raw.insulationTally && typeof raw.insulationTally.totalBags === "number"
      ? {
          totalBags: raw.insulationTally.totalBags,
          entries: rawEntries.map((entry) => ({
            ...entry,
            truckId: entry.truckId ?? null,
            truckName: entry.truckName ?? "",
          })),
        }
      : emptyTally();
  let categories = Array.isArray(raw.categories) ? [...raw.categories] : [];

  if (categories.length === 0) {
    categories = buildDefaultCategories(stamped);
  }

  const known = new Set(categories.map((c) => c.id));
  for (const item of items) {
    if (!item.category) {
      item.category = categories[0]?.id || "other";
      continue;
    }
    if (!known.has(item.category)) {
      const name =
        item.category.charAt(0).toUpperCase() + item.category.slice(1);
      categories.push({
        id: item.category,
        name,
        createdAt: stamped,
        updatedAt: stamped,
      });
      known.add(item.category);
    }
  }

  categories.sort((a, b) => a.name.localeCompare(b.name));

  // Ensure every truck has stock; backfill from checkout/job history if missing
  const needsStockBackfill = trucks.some((t) => !Array.isArray(t.stock));
  if (needsStockBackfill) {
    trucks = trucks.map((truck) => {
      if (Array.isArray(truck.stock)) {
        return { ...truck, stock: truck.stock.filter((s) => s.quantity > 0) };
      }
      const map = new Map<string, TruckStockItem>();
      for (const checkout of checkouts) {
        if (checkout.truckId !== truck.id) continue;
        const current = map.get(checkout.itemId);
        if (current) current.quantity += checkout.quantity;
        else {
          map.set(checkout.itemId, {
            itemId: checkout.itemId,
            itemName: checkout.itemName,
            unit: checkout.unit,
            quantity: checkout.quantity,
          });
        }
      }
      for (const job of jobs) {
        if (job.truckId !== truck.id) continue;
        for (const mat of job.materials || []) {
          const current = map.get(mat.itemId);
          if (!current) continue;
          current.quantity = Math.max(0, current.quantity - mat.quantity);
        }
      }
      return {
        ...truck,
        stock: [...map.values()].filter((s) => s.quantity > 0),
      };
    });
  } else {
    trucks = trucks.map((truck) => ({
      ...truck,
      stock: (truck.stock || []).filter((s) => s.quantity > 0),
    }));
  }

  const lineItemTemplates = (
    Array.isArray(raw.lineItemTemplates) ? raw.lineItemTemplates : []
  ).map((t) => normalizeTemplate(t as LineItemTemplate));

  const jobber =
    raw.jobber &&
    typeof raw.jobber === "object" &&
    typeof (raw.jobber as JobberConnection).accessToken === "string"
      ? (raw.jobber as JobberConnection)
      : null;

  return {
    settings,
    items,
    categories,
    checkouts,
    trucks,
    jobs,
    insulationTally,
    lineItemTemplates,
    jobber,
  };
}

function normalizeCalcMode(value: unknown): TemplateCalcMode {
  return value === "sqft_coverage" ? "sqft_coverage" : "per_line";
}

function normalizeTemplateMaterials(
  materials: LineItemTemplateMaterial[] | undefined
): LineItemTemplateMaterial[] {
  if (!Array.isArray(materials)) return [];
  const map = new Map<string, LineItemTemplateMaterial>();
  for (const m of materials) {
    const itemId = String(m.itemId || "").trim();
    if (!itemId) continue;
    const calcMode = normalizeCalcMode(
      (m as LineItemTemplateMaterial).calcMode
    );
    const qty = Number(m.quantity);
    const coverage = Number((m as LineItemTemplateMaterial).coverageSqft);
    if (calcMode === "sqft_coverage") {
      if (!Number.isFinite(coverage) || coverage <= 0) continue;
    } else if (!Number.isFinite(qty) || qty <= 0) {
      continue;
    }
    const key = `${itemId}::${calcMode}`;
    map.set(key, {
      itemId,
      itemName: String(m.itemName || "").trim() || "Material",
      unit: String(m.unit || "units").trim() || "units",
      calcMode,
      quantity:
        calcMode === "per_line" && Number.isFinite(qty)
          ? Math.round(qty * 1000) / 1000
          : 0,
      coverageSqft:
        calcMode === "sqft_coverage" && Number.isFinite(coverage)
          ? Math.round(coverage * 1000) / 1000
          : 0,
    });
  }
  return [...map.values()];
}

function normalizeTemplate(t: Partial<LineItemTemplate>): LineItemTemplate {
  const stamped = nowIso();
  return {
    id: String(t.id || randomUUID()),
    name: String(t.name || "").trim(),
    notes: String(t.notes || "").trim(),
    materials: normalizeTemplateMaterials(t.materials),
    createdAt: t.createdAt || stamped,
    updatedAt: t.updatedAt || stamped,
  };
}

function buildSeedData(): AppData {
  const stamped = nowIso();
  return {
    settings: defaultSettings,
    categories: buildDefaultCategories(stamped),
    checkouts: [],
    trucks: [
      {
        id: randomUUID(),
        name: "Truck A",
        notes: "",
        stock: [],
        createdAt: stamped,
        updatedAt: stamped,
      },
      {
        id: randomUUID(),
        name: "Truck B",
        notes: "",
        stock: [],
        createdAt: stamped,
        updatedAt: stamped,
      },
    ],
    jobs: [],
    insulationTally: emptyTally(),
    lineItemTemplates: [],
    jobber: null,
    items: seedItems.map((item) => ({
      ...item,
      unitCost: item.unitCost ?? 0,
      id: randomUUID(),
      createdAt: stamped,
      updatedAt: stamped,
      lastAlertSentAt: null,
    })),
  };
}

export async function readData(): Promise<AppData> {
  const raw = await loadRawData();
  if (!raw) {
    // Production must not invent a catalog when the inventory key is empty.
    // `next dev` still seeds data/inventory.json so local setup stays the same.
    if (process.env.NODE_ENV === "production") {
      throw new StockDataMissingError();
    }
    const seeded = buildSeedData();
    await saveRawData(seeded);
    return seeded;
  }

  const parsed = JSON.parse(raw) as Partial<AppData>;
  const normalized = normalizeData(parsed);

  const trucksNeedStock = (parsed.trucks || []).some(
    (t) => !Array.isArray((t as Truck).stock)
  );
  const jobsNeedBags = (parsed.jobs || []).some(
    (j) => typeof (j as JobRecord).bagCount !== "number"
  );
  // Persist migration if newer collections were missing
  if (
    !Array.isArray(parsed.categories) ||
    parsed.categories.length === 0 ||
    !Array.isArray(parsed.checkouts) ||
    !Array.isArray(parsed.trucks) ||
    !Array.isArray(parsed.jobs) ||
    !parsed.insulationTally ||
    !Array.isArray(parsed.lineItemTemplates) ||
    trucksNeedStock ||
    jobsNeedBags
  ) {
    await saveRawData(normalized);
  }

  return normalized;
}

export async function writeData(data: AppData): Promise<void> {
  await saveRawData(data);
}

/** Inventory snapshot for download. Secrets are cleared and are not written back. */
export async function readInventoryForBackup(): Promise<AppData> {
  const data = await readData();
  return {
    ...data,
    settings: { ...data.settings, smtpPass: "" },
    jobber: null,
  };
}

/**
 * Replace inventory with a backup. Keeps the live Jobber connection and SMTP
 * password when the current document can still be read.
 */
export async function replaceStoredInventory(
  partial: Partial<AppData>
): Promise<{ items: number; trucks: number; jobs: number }> {
  const next = normalizeData({
    ...partial,
    settings: partial.settings
      ? { ...partial.settings, smtpPass: "" }
      : partial.settings,
    jobber: null,
  });
  const raw = await loadRawData();
  if (raw) {
    try {
      const current = normalizeData(JSON.parse(raw) as Partial<AppData>);
      next.jobber = current.jobber;
      next.settings = {
        ...next.settings,
        smtpPass: current.settings.smtpPass || "",
      };
    } catch {
      // The stored document is unreadable. The uploaded backup replaces it.
    }
  }
  await writeData(next);
  return {
    items: next.items.length,
    trucks: next.trucks.length,
    jobs: next.jobs.length,
  };
}

export async function listItems(): Promise<InventoryItem[]> {
  const data = await readData();
  return data.items.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getItem(id: string): Promise<InventoryItem | null> {
  const data = await readData();
  return data.items.find((item) => item.id === id) ?? null;
}

export async function createItem(
  input: Omit<InventoryItem, "id" | "createdAt" | "updatedAt" | "lastAlertSentAt">
): Promise<InventoryItem> {
  const data = await readData();
  if (!data.categories.some((c) => c.id === input.category)) {
    throw new Error("Invalid category");
  }
  const stamped = nowIso();
  const item: InventoryItem = {
    ...input,
    id: randomUUID(),
    createdAt: stamped,
    updatedAt: stamped,
    lastAlertSentAt: null,
  };
  data.items.push(item);
  await writeData(data);
  return item;
}

export async function updateItem(
  id: string,
  patch: Partial<Omit<InventoryItem, "id" | "createdAt">>
): Promise<InventoryItem | null> {
  const data = await readData();
  const index = data.items.findIndex((item) => item.id === id);
  if (index === -1) return null;

  if (
    patch.category !== undefined &&
    !data.categories.some((c) => c.id === patch.category)
  ) {
    throw new Error("Invalid category");
  }

  const next: InventoryItem = {
    ...data.items[index],
    ...patch,
    id,
    updatedAt: nowIso(),
  };
  if (patch.photo !== undefined) {
    next.photo = sanitizeItemPhoto(patch.photo) ?? null;
  }
  if (next.quantity > next.lowStockThreshold) {
    next.lastAlertSentAt = null;
  }
  data.items[index] = next;
  await writeData(data);
  return next;
}

export async function deleteItem(id: string): Promise<boolean> {
  const data = await readData();
  const before = data.items.length;
  data.items = data.items.filter((item) => item.id !== id);
  if (data.items.length === before) return false;
  await writeData(data);
  return true;
}

export async function adjustQuantity(
  id: string,
  delta: number
): Promise<InventoryItem | null> {
  const data = await readData();
  const index = data.items.findIndex((item) => item.id === id);
  if (index === -1) return null;

  const current = data.items[index];
  const quantity = Math.max(0, current.quantity + delta);
  const next: InventoryItem = {
    ...current,
    quantity,
    updatedAt: nowIso(),
    // Restocking above the threshold must clear cooldown so the next
    // low-stock event (from any phone) can notify again.
    lastAlertSentAt:
      quantity > current.lowStockThreshold ? null : current.lastAlertSentAt,
  };
  data.items[index] = next;
  await writeData(data);
  return next;
}

export async function checkoutMaterials(input: {
  employeeName: string;
  truckId?: string | null;
  lines: { itemId: string; quantity: number }[];
}): Promise<{ checkouts: CheckoutRecord[]; items: InventoryItem[] }> {
  const employeeName = input.employeeName.trim();
  if (!employeeName) throw new Error("Employee name is required");

  const lines = (input.lines || [])
    .map((line) => ({
      itemId: String(line.itemId || ""),
      quantity: Math.floor(Number(line.quantity)),
    }))
    .filter((line) => line.itemId && Number.isFinite(line.quantity) && line.quantity > 0);

  if (lines.length === 0) {
    throw new Error("Select at least one material to check out");
  }

  const seen = new Set<string>();
  for (const line of lines) {
    if (seen.has(line.itemId)) {
      throw new Error("Duplicate materials in checkout");
    }
    seen.add(line.itemId);
  }

  const data = await readData();
  let truckId: string | null = input.truckId ? String(input.truckId) : null;
  let truckName = "";

  if (data.trucks.length > 0) {
    if (!truckId) throw new Error("Select a truck");
    const truck = data.trucks.find((t) => t.id === truckId);
    if (!truck) throw new Error("Truck not found");
    truckName = truck.name;
  } else {
    truckId = null;
  }

  const stamped = nowIso();
  const checkouts: CheckoutRecord[] = [];
  const updatedItems: InventoryItem[] = [];
  const truckIndex = truckId
    ? data.trucks.findIndex((t) => t.id === truckId)
    : -1;

  for (const line of lines) {
    const index = data.items.findIndex((item) => item.id === line.itemId);
    if (index === -1) throw new Error("Material not found");

    const current = data.items[index];
    if (current.quantity <= 0) {
      throw new Error(`${current.name} is out of stock`);
    }
    if (line.quantity > current.quantity) {
      throw new Error(
        `Only ${current.quantity} ${current.unit} of ${current.name} available`
      );
    }

    const quantityAfter = current.quantity - line.quantity;
    const item: InventoryItem = {
      ...current,
      quantity: quantityAfter,
      updatedAt: stamped,
      lastAlertSentAt:
        quantityAfter > current.lowStockThreshold
          ? null
          : current.lastAlertSentAt,
    };
    const checkout: CheckoutRecord = {
      id: randomUUID(),
      itemId: current.id,
      itemName: current.name,
      categoryId: current.category,
      quantity: line.quantity,
      unit: current.unit,
      employeeName,
      truckId,
      truckName,
      quantityAfter,
      createdAt: stamped,
      kind: "checkout",
    };

    data.items[index] = item;
    checkouts.push(checkout);
    updatedItems.push(item);

    // Move stock onto the selected truck
    if (truckIndex >= 0) {
      const truck = data.trucks[truckIndex];
      const stock = [...(truck.stock || [])];
      const stockIndex = stock.findIndex((s) => s.itemId === current.id);
      if (stockIndex >= 0) {
        stock[stockIndex] = {
          ...stock[stockIndex],
          quantity: stock[stockIndex].quantity + line.quantity,
          itemName: current.name,
          unit: current.unit,
        };
      } else {
        stock.push({
          itemId: current.id,
          itemName: current.name,
          unit: current.unit,
          quantity: line.quantity,
        });
      }
      data.trucks[truckIndex] = {
        ...truck,
        stock: stock.filter((s) => s.quantity > 0),
        updatedAt: stamped,
      };
    }
  }

  data.checkouts = [...checkouts, ...(data.checkouts || [])];
  await writeData(data);
  return { checkouts, items: updatedItems };
}

export async function returnTruckStock(input: {
  truckId: string;
  employeeName?: string;
  lines: { itemId: string; quantity: number }[];
}): Promise<{ truck: Truck; items: InventoryItem[]; returns: CheckoutRecord[] }> {
  const truckId = String(input.truckId || "");
  const employeeName = String(input.employeeName || "").trim() || "Returned";
  const lines = (input.lines || [])
    .map((line) => ({
      itemId: String(line.itemId || ""),
      quantity: roundQty(Number(line.quantity)),
    }))
    .filter((line) => line.itemId && Number.isFinite(line.quantity) && line.quantity > 0);

  if (!truckId) throw new Error("Select a truck");
  if (lines.length === 0) {
    throw new Error("Select at least one material to return");
  }

  const seen = new Set<string>();
  for (const line of lines) {
    if (seen.has(line.itemId)) {
      throw new Error("Duplicate materials in return");
    }
    seen.add(line.itemId);
  }

  const data = await readData();
  const truckIndex = data.trucks.findIndex((t) => t.id === truckId);
  if (truckIndex === -1) throw new Error("Truck not found");

  const stamped = nowIso();
  const truck = data.trucks[truckIndex];
  let stock = [...(truck.stock || [])];
  const updatedItems: InventoryItem[] = [];
  const returns: CheckoutRecord[] = [];

  for (const line of lines) {
    const stockIndex = stock.findIndex((s) => s.itemId === line.itemId);
    if (stockIndex === -1) {
      throw new Error("That material is not on this truck");
    }
    const onTruck = stock[stockIndex];
    if (line.quantity > onTruck.quantity) {
      throw new Error(
        `Only ${onTruck.quantity} ${onTruck.unit} of ${onTruck.itemName} on ${truck.name}`
      );
    }

    const itemIndex = data.items.findIndex((item) => item.id === line.itemId);
    if (itemIndex === -1) {
      throw new Error(`${onTruck.itemName} is no longer in inventory`);
    }
    const current = data.items[itemIndex];
    const quantityAfter = roundQty(current.quantity + line.quantity);
    const item: InventoryItem = {
      ...current,
      quantity: quantityAfter,
      updatedAt: stamped,
      lastAlertSentAt:
        quantityAfter > current.lowStockThreshold ? null : current.lastAlertSentAt,
    };
    data.items[itemIndex] = item;
    updatedItems.push(item);

    const left = roundQty(onTruck.quantity - line.quantity);
    if (left <= 0) {
      stock = stock.filter((_, i) => i !== stockIndex);
    } else {
      stock[stockIndex] = { ...onTruck, quantity: left };
    }

    returns.push({
      id: randomUUID(),
      itemId: current.id,
      itemName: current.name,
      categoryId: current.category,
      quantity: line.quantity,
      unit: current.unit,
      employeeName,
      truckId,
      truckName: truck.name,
      quantityAfter,
      createdAt: stamped,
      kind: "return",
    });
  }

  const nextTruck: Truck = {
    ...truck,
    stock: stock.filter((s) => s.quantity > 0),
    updatedAt: stamped,
  };
  data.trucks[truckIndex] = nextTruck;
  data.checkouts = [...returns, ...(data.checkouts || [])];
  await writeData(data);
  return { truck: nextTruck, items: updatedItems, returns };
}

export async function moveTruckStock(input: {
  fromTruckId: string;
  toTruckId: string;
  employeeName?: string;
  lines: { itemId: string; quantity: number }[];
}): Promise<{ truck: Truck; destTruck: Truck; transfers: CheckoutRecord[] }> {
  const fromTruckId = String(input.fromTruckId || "");
  const toTruckId = String(input.toTruckId || "");
  const employeeName = String(input.employeeName || "").trim() || "Moved";
  const lines = (input.lines || [])
    .map((line) => ({
      itemId: String(line.itemId || ""),
      quantity: roundQty(Number(line.quantity)),
    }))
    .filter((line) => line.itemId && Number.isFinite(line.quantity) && line.quantity > 0);

  if (!fromTruckId) throw new Error("Select a truck");
  if (!toTruckId) throw new Error("Select a truck to move to");
  if (fromTruckId === toTruckId) {
    throw new Error("Pick a different truck");
  }
  if (lines.length === 0) {
    throw new Error("Select at least one material to move");
  }

  const seen = new Set<string>();
  for (const line of lines) {
    if (seen.has(line.itemId)) {
      throw new Error("Duplicate materials in move");
    }
    seen.add(line.itemId);
  }

  const data = await readData();
  const fromIndex = data.trucks.findIndex((t) => t.id === fromTruckId);
  const destIndex = data.trucks.findIndex((t) => t.id === toTruckId);
  if (fromIndex === -1) throw new Error("Truck not found");
  if (destIndex === -1) throw new Error("Destination truck not found");

  const stamped = nowIso();
  const fromTruck = data.trucks[fromIndex];
  const destTruck = data.trucks[destIndex];
  let fromStock = [...(fromTruck.stock || [])];
  let destStock = [...(destTruck.stock || [])];
  const transfers: CheckoutRecord[] = [];

  for (const line of lines) {
    const stockIndex = fromStock.findIndex((s) => s.itemId === line.itemId);
    if (stockIndex === -1) {
      throw new Error("That material is not on this truck");
    }
    const onTruck = fromStock[stockIndex];
    if (line.quantity > onTruck.quantity) {
      throw new Error(
        `Only ${onTruck.quantity} ${onTruck.unit} of ${onTruck.itemName} on ${fromTruck.name}`
      );
    }

    const catalog = data.items.find((item) => item.id === line.itemId);
    const left = roundQty(onTruck.quantity - line.quantity);
    if (left <= 0) {
      fromStock = fromStock.filter((_, i) => i !== stockIndex);
    } else {
      fromStock[stockIndex] = { ...onTruck, quantity: left };
    }

    const destLineIndex = destStock.findIndex((s) => s.itemId === line.itemId);
    if (destLineIndex === -1) {
      destStock.push({
        itemId: onTruck.itemId,
        itemName: onTruck.itemName,
        unit: onTruck.unit,
        quantity: line.quantity,
      });
    } else {
      destStock[destLineIndex] = {
        ...destStock[destLineIndex],
        quantity: roundQty(destStock[destLineIndex].quantity + line.quantity),
      };
    }

    transfers.push({
      id: randomUUID(),
      itemId: onTruck.itemId,
      itemName: onTruck.itemName,
      categoryId: catalog?.category || "",
      quantity: line.quantity,
      unit: onTruck.unit,
      employeeName,
      truckId: toTruckId,
      truckName: `${fromTruck.name} → ${destTruck.name}`,
      quantityAfter: catalog?.quantity ?? 0,
      createdAt: stamped,
      kind: "transfer",
    });
  }

  const nextFrom: Truck = {
    ...fromTruck,
    stock: fromStock.filter((s) => s.quantity > 0),
    updatedAt: stamped,
  };
  const nextDest: Truck = {
    ...destTruck,
    stock: destStock.filter((s) => s.quantity > 0),
    updatedAt: stamped,
  };
  data.trucks[fromIndex] = nextFrom;
  data.trucks[destIndex] = nextDest;
  data.checkouts = [...transfers, ...(data.checkouts || [])];
  await writeData(data);
  return { truck: nextFrom, destTruck: nextDest, transfers };
}

export async function listTrucks(): Promise<Truck[]> {
  const data = await readData();
  return [...data.trucks].sort((a, b) => a.name.localeCompare(b.name));
}

export async function createTruck(input: {
  name: string;
  notes?: string;
  jobberNames?: string[] | string;
}): Promise<Truck> {
  const name = input.name.trim();
  if (!name) throw new Error("Truck name is required");
  const data = await readData();
  if (data.trucks.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
    throw new Error("A truck with that name already exists");
  }
  const stamped = nowIso();
  const truck: Truck = {
    id: randomUUID(),
    name,
    notes: String(input.notes || "").trim(),
    jobberNames: parseJobberNameList(input.jobberNames),
    stock: [],
    createdAt: stamped,
    updatedAt: stamped,
  };
  data.trucks.push(truck);
  await writeData(data);
  return truck;
}

export async function updateTruck(
  id: string,
  patch: { name?: string; notes?: string; jobberNames?: string[] | string }
): Promise<Truck | null> {
  const data = await readData();
  const index = data.trucks.findIndex((t) => t.id === id);
  if (index === -1) return null;

  const name =
    patch.name !== undefined ? patch.name.trim() : data.trucks[index].name;
  if (!name) throw new Error("Truck name is required");
  if (
    data.trucks.some(
      (t) => t.id !== id && t.name.toLowerCase() === name.toLowerCase()
    )
  ) {
    throw new Error("A truck with that name already exists");
  }

  const next: Truck = {
    ...data.trucks[index],
    name,
    notes:
      patch.notes !== undefined
        ? String(patch.notes).trim()
        : data.trucks[index].notes,
    jobberNames:
      patch.jobberNames !== undefined
        ? parseJobberNameList(patch.jobberNames)
        : parseJobberNameList(data.trucks[index].jobberNames),
    updatedAt: nowIso(),
  };
  data.trucks[index] = next;
  await writeData(data);
  return next;
}

export async function deleteTruck(id: string): Promise<boolean> {
  const data = await readData();
  const before = data.trucks.length;
  data.trucks = data.trucks.filter((t) => t.id !== id);
  if (data.trucks.length === before) return false;
  await writeData(data);
  return true;
}

export async function getTruck(id: string): Promise<Truck | null> {
  const data = await readData();
  return data.trucks.find((t) => t.id === id) ?? null;
}

function normalizeMaterials(materials: JobMaterial[]): JobMaterial[] {
  return (materials || [])
    .map((m) => ({
      itemId: String(m.itemId || ""),
      itemName: String(m.itemName || "").trim(),
      quantity: roundQty(Number(m.quantity)),
      unit: String(m.unit || "units").trim() || "units",
    }))
    .filter((m) => m.itemName && m.quantity > 0);
}

export async function seedDemoUsageJobs() {
  const data = await readData();
  const result = applyDemoUsageJobs(data);
  await writeData(data);
  return result;
}

export async function listJobs(truckId?: string | string[]): Promise<JobRecord[]> {
  const data = await readData();
  const ids = (Array.isArray(truckId) ? truckId : truckId ? [truckId] : [])
    .map((id) => String(id || "").trim())
    .filter(Boolean);
  const jobs = ids.length
    ? data.jobs.filter((job) => job.truckId && ids.includes(job.truckId))
    : data.jobs;
  return [...jobs].sort(compareJobsBySchedule);
}

export async function getJob(id: string): Promise<JobRecord | null> {
  const data = await readData();
  return data.jobs.find((j) => j.id === id) ?? null;
}

export async function createJob(input: {
  name: string;
  location: string;
  notes?: string;
  truckId?: string | null;
  materials?: JobMaterial[];
}): Promise<JobRecord> {
  const name = input.name.trim();
  const location = input.location.trim();
  if (!name) throw new Error("Job name is required");
  if (!location) throw new Error("Job location is required");

  const data = await readData();
  let truckId: string | null = input.truckId ? String(input.truckId) : null;
  let truckName = "";
  if (truckId) {
    const truck = data.trucks.find((t) => t.id === truckId);
    if (!truck) throw new Error("Truck not found");
    truckName = truck.name;
  }

  const materials = normalizeMaterials(input.materials || []);
  const stamped = nowIso();
  const job: JobRecord = {
    id: randomUUID(),
    name,
    location,
    notes: String(input.notes || "").trim(),
    truckId,
    truckName,
    materials,
    bagCount: 0,
    bagEntries: [],
    amountCharged: 0,
    materialCost: 0,
    createdAt: stamped,
    updatedAt: stamped,
  };
  data.jobs = [job, ...data.jobs];
  await writeData(data);
  return job;
}

export async function updateJob(
  id: string,
  patch: {
    name?: string;
    location?: string;
    notes?: string;
    materials?: JobMaterial[];
    amountCharged?: number;
    materialCost?: number;
  }
): Promise<JobRecord | null> {
  const data = await readData();
  const index = data.jobs.findIndex((j) => j.id === id);
  if (index === -1) return null;

  const current = data.jobs[index];
  const name =
    patch.name !== undefined ? patch.name.trim() : current.name;
  const location =
    patch.location !== undefined ? patch.location.trim() : current.location;
  if (!name) throw new Error("Job name is required");
  if (!location) throw new Error("Job location is required");

  const money = (value: number | undefined, fallback: number) => {
    if (value === undefined) return fallback;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) throw new Error("Money values must be 0 or more");
    return Math.round(n * 100) / 100;
  };

  const next: JobRecord = {
    ...current,
    name,
    location,
    notes:
      patch.notes !== undefined ? String(patch.notes).trim() : current.notes,
    materials:
      patch.materials !== undefined
        ? normalizeMaterials(patch.materials)
        : current.materials,
    amountCharged: money(patch.amountCharged, current.amountCharged || 0),
    materialCost: money(patch.materialCost, current.materialCost || 0),
    updatedAt: nowIso(),
  };
  data.jobs[index] = next;
  await writeData(data);
  return next;
}

/** Sum job materials × inventory unitCost. Returns 0 if no unit costs set. */
export async function estimateJobMaterialCost(jobId: string): Promise<number> {
  const data = await readData();
  const job = data.jobs.find((j) => j.id === jobId);
  if (!job) throw new Error("Job not found");
  const byId = new Map(data.items.map((i) => [i.id, i]));
  let total = 0;
  for (const mat of job.materials || []) {
    const item = byId.get(mat.itemId);
    const unitCost = item?.unitCost || 0;
    total += mat.quantity * unitCost;
  }
  return Math.round(total * 100) / 100;
}

export async function deleteJob(id: string): Promise<boolean> {
  const data = await readData();
  const before = data.jobs.length;
  data.jobs = data.jobs.filter((j) => j.id !== id);
  if (data.jobs.length === before) return false;
  await writeData(data);
  return true;
}

export type JobberTruckJobDraft = {
  jobberJobId: string;
  jobberVisitId?: string | null;
  scheduledAt: string | null;
  name: string;
  location: string;
  assignedNames: string[];
  truckId: string;
};

function jobberDayKey(jobberJobId: string, scheduledAt: string | null): string {
  return `${jobberJobId}|${formatYmdInZone(scheduledAt) || "undated"}`;
}

/** Add new Jobber truck jobs. Already synced jobs are left as-is. */
export async function upsertJobberTruckJobs(input: {
  drafts: JobberTruckJobDraft[];
  windowFromYmd: string;
  windowToYmd: string;
}): Promise<{ created: number; updated: number; removed: number; kept: number }> {
  void input.windowFromYmd;
  void input.windowToYmd;
  const data = await readData();
  const trucksById = new Map(data.trucks.map((truck) => [truck.id, truck]));
  const stamped = nowIso();
  let created = 0;
  let kept = 0;

  const incoming = new Map<string, JobberTruckJobDraft>();
  for (const draft of input.drafts) {
    if (!draft.jobberJobId || !draft.truckId || !trucksById.has(draft.truckId)) {
      continue;
    }
    incoming.set(`${jobberDayKey(draft.jobberJobId, draft.scheduledAt)}|${draft.truckId}`, draft);
  }

  const seen = new Set<string>();
  const nextJobs: JobRecord[] = [];

  for (const job of data.jobs) {
    nextJobs.push(job);
    if (!job.jobberJobId || !job.truckId) continue;
    const key = `${jobberDayKey(job.jobberJobId, job.scheduledAt || job.createdAt)}|${job.truckId}`;
    if (incoming.has(key)) {
      seen.add(key);
      kept += 1;
    }
  }

  for (const [key, draft] of incoming) {
    if (seen.has(key)) continue;
    const truck = trucksById.get(draft.truckId);
    if (!truck) continue;
    nextJobs.push({
      id: randomUUID(),
      name: draft.name,
      location: draft.location || "Scheduled in Jobber",
      notes: "",
      truckId: draft.truckId,
      truckName: truck.name,
      materials: [],
      bagCount: 0,
      bagEntries: [],
      amountCharged: 0,
      materialCost: 0,
      jobberJobId: draft.jobberJobId,
      jobberVisitId: draft.jobberVisitId || null,
      scheduledAt: draft.scheduledAt,
      jobberAssignees: draft.assignedNames,
      createdAt: stamped,
      updatedAt: stamped,
    });
    created += 1;
  }

  data.jobs = nextJobs;
  if (data.jobber) {
    data.jobber = { ...data.jobber, lastJobSyncAt: stamped };
  }
  await writeData(data);
  return { created, updated: 0, removed: 0, kept };
}

function tallyForTruck(data: AppData, truckId?: string | null): InsulationTally {
  if (!truckId) {
    return data.insulationTally;
  }
  const entries = data.insulationTally.entries.filter(
    (entry) => entry.truckId === truckId
  );
  return {
    totalBags: entries.reduce((sum, entry) => sum + entry.bags, 0),
    entries,
  };
}

export async function getInsulationTally(
  truckId?: string | null
): Promise<InsulationTally> {
  const data = await readData();
  return tallyForTruck(data, truckId);
}

export async function addInsulationBags(input: {
  bags: number;
  note?: string;
  employeeName?: string;
  truckId?: string | null;
}): Promise<InsulationTally> {
  const bags = Math.floor(Number(input.bags));
  if (!Number.isFinite(bags) || bags < 1) {
    throw new Error("Bags must be at least 1");
  }

  const data = await readData();
  let truckId: string | null = input.truckId ? String(input.truckId) : null;
  let truckName = "";
  if (truckId) {
    const truck = data.trucks.find((t) => t.id === truckId);
    if (!truck) throw new Error("Truck not found");
    truckName = truck.name;
  }

  const entry: InsulationTallyEntry = {
    id: randomUUID(),
    bags,
    note: String(input.note || "").trim(),
    employeeName: String(input.employeeName || "").trim(),
    truckId,
    truckName,
    createdAt: nowIso(),
  };
  data.insulationTally = {
    totalBags: data.insulationTally.totalBags + bags,
    entries: [entry, ...data.insulationTally.entries],
  };
  await writeData(data);
  return tallyForTruck(data, truckId);
}

export async function resetInsulationTally(
  truckId?: string | null
): Promise<InsulationTally> {
  const data = await readData();
  if (!truckId) {
    data.insulationTally = emptyTally();
  } else {
    const removed = data.insulationTally.entries.filter(
      (entry) => entry.truckId === truckId
    );
    const removedTotal = removed.reduce((sum, entry) => sum + entry.bags, 0);
    data.insulationTally = {
      totalBags: Math.max(0, data.insulationTally.totalBags - removedTotal),
      entries: data.insulationTally.entries.filter(
        (entry) => entry.truckId !== truckId
      ),
    };
  }
  await writeData(data);
  return tallyForTruck(data, truckId);
}

export async function getTruckStock(truckId: string): Promise<TruckStockItem[]> {
  const truck = await getTruck(truckId);
  if (!truck) return [];
  return [...(truck.stock || [])]
    .filter((s) => s.quantity > 0)
    .sort((a, b) => a.itemName.localeCompare(b.itemName));
}

/** Use materials from truck stock on a job — removes them from the truck. */
export async function useTruckMaterialsOnJob(input: {
  jobId: string;
  lines: { itemId: string; quantity: number }[];
}): Promise<{ job: JobRecord; truck: Truck }> {
  const lines = (input.lines || [])
    .map((line) => ({
      itemId: String(line.itemId || ""),
      quantity: roundQty(Number(line.quantity)),
    }))
    .filter((line) => line.itemId && line.quantity > 0);

  if (lines.length === 0) {
    throw new Error("Select materials currently on the truck");
  }

  const data = await readData();
  const jobIndex = data.jobs.findIndex((j) => j.id === input.jobId);
  if (jobIndex === -1) throw new Error("Job not found");
  const job = data.jobs[jobIndex];
  if (!job.truckId) throw new Error("Job has no truck assigned");

  const truckIndex = data.trucks.findIndex((t) => t.id === job.truckId);
  if (truckIndex === -1) throw new Error("Truck not found");

  const truck = data.trucks[truckIndex];
  let stock = [...(truck.stock || [])];
  const used: JobMaterial[] = [];

  for (const line of lines) {
    const stockIndex = stock.findIndex((s) => s.itemId === line.itemId);
    if (stockIndex === -1) {
      throw new Error("That material is not on this truck");
    }
    const onTruck = stock[stockIndex];
    if (line.quantity > onTruck.quantity) {
      throw new Error(
        `Only ${onTruck.quantity} ${onTruck.unit} of ${onTruck.itemName} on ${truck.name}`
      );
    }

    used.push({
      itemId: onTruck.itemId,
      itemName: onTruck.itemName,
      quantity: line.quantity,
      unit: onTruck.unit,
    });

    const left = roundQty(onTruck.quantity - line.quantity);
    if (left <= 0) {
      stock = stock.filter((_, i) => i !== stockIndex);
    } else {
      stock[stockIndex] = { ...onTruck, quantity: left };
    }
  }

  // Merge into job materials log
  const materials = [...job.materials];
  for (const line of used) {
    const existing = materials.findIndex((m) => m.itemId === line.itemId);
    if (existing >= 0) {
      materials[existing] = {
        ...materials[existing],
        quantity: roundQty(materials[existing].quantity + line.quantity),
      };
    } else {
      materials.push(line);
    }
  }

  const stamped = nowIso();
  const nextJob: JobRecord = {
    ...job,
    materials,
    updatedAt: stamped,
  };
  const nextTruck: Truck = {
    ...truck,
    stock: stock.filter((s) => s.quantity > 0),
    updatedAt: stamped,
  };

  data.jobs[jobIndex] = nextJob;
  data.trucks[truckIndex] = nextTruck;
  await writeData(data);
  return { job: nextJob, truck: nextTruck };
}

function isBagStockItem(
  stock: TruckStockItem,
  items: InventoryItem[]
): boolean {
  if (/bag/i.test(stock.unit) || /bag/i.test(stock.itemName)) return true;
  const inv = items.find((i) => i.id === stock.itemId);
  return inv?.category === "insulation";
}

/** Add insulation bags to a job tally and subtract them from truck stock. */
export async function addBagsToJob(input: {
  jobId: string;
  bags: number;
  employeeName?: string;
  itemId?: string;
}): Promise<{ job: JobRecord; truck: Truck }> {
  const bags = Math.floor(Number(input.bags));
  if (!Number.isFinite(bags) || bags < 1) {
    throw new Error("Bags must be at least 1");
  }

  const data = await readData();
  const jobIndex = data.jobs.findIndex((j) => j.id === input.jobId);
  if (jobIndex === -1) throw new Error("Job not found");
  const job = data.jobs[jobIndex];
  if (!job.truckId) throw new Error("Job has no truck assigned");

  const truckIndex = data.trucks.findIndex((t) => t.id === job.truckId);
  if (truckIndex === -1) throw new Error("Truck not found");
  const truck = data.trucks[truckIndex];
  let stock = [...(truck.stock || [])];

  const bagCandidates = stock
    .filter((s) => s.quantity > 0 && isBagStockItem(s, data.items))
    .sort((a, b) => {
      const aBag = /bag/i.test(a.unit) ? 0 : 1;
      const bBag = /bag/i.test(b.unit) ? 0 : 1;
      if (aBag !== bBag) return aBag - bBag;
      return b.quantity - a.quantity;
    });

  if (bagCandidates.length === 0) {
    throw new Error(`No insulation bags on ${truck.name}`);
  }

  let target = bagCandidates[0];
  if (input.itemId) {
    const chosen = bagCandidates.find((s) => s.itemId === input.itemId);
    if (!chosen) {
      throw new Error("That bag product is not on this truck");
    }
    target = chosen;
  }

  if (bags > target.quantity) {
    throw new Error(
      `Only ${target.quantity} ${target.unit} of ${target.itemName} on ${truck.name}`
    );
  }

  const stockIndex = stock.findIndex((s) => s.itemId === target.itemId);
  const left = stock[stockIndex].quantity - bags;
  if (left <= 0) {
    stock = stock.filter((_, i) => i !== stockIndex);
  } else {
    stock[stockIndex] = { ...stock[stockIndex], quantity: left };
  }

  const stamped = nowIso();
  const entry: JobBagEntry = {
    id: randomUUID(),
    bags,
    employeeName: String(input.employeeName || "").trim(),
    itemId: target.itemId,
    itemName: target.itemName,
    createdAt: stamped,
  };

  const materials = [...(job.materials || [])];
  const existingMat = materials.findIndex((m) => m.itemId === target.itemId);
  if (existingMat >= 0) {
    materials[existingMat] = {
      ...materials[existingMat],
      quantity: materials[existingMat].quantity + bags,
    };
  } else {
    materials.push({
      itemId: target.itemId,
      itemName: target.itemName,
      quantity: bags,
      unit: target.unit,
    });
  }

  const nextJob: JobRecord = {
    ...job,
    bagCount: (job.bagCount || 0) + bags,
    bagEntries: [entry, ...(job.bagEntries || [])],
    materials,
    updatedAt: stamped,
  };
  const nextTruck: Truck = {
    ...truck,
    stock: stock.filter((s) => s.quantity > 0),
    updatedAt: stamped,
  };

  data.jobs[jobIndex] = nextJob;
  data.trucks[truckIndex] = nextTruck;
  await writeData(data);
  return { job: nextJob, truck: nextTruck };
}

function isBagMaterial(material: JobMaterial) {
  return (
    /bag/i.test(material.unit) ||
    /bag/i.test(material.itemName) ||
    /insul/i.test(material.itemName)
  );
}

function putOnTruckStock(
  stock: TruckStockItem[],
  line: JobMaterial,
  quantity: number
): TruckStockItem[] {
  const next = [...stock];
  const index = next.findIndex((item) => item.itemId === line.itemId);
  if (index >= 0) {
    next[index] = {
      ...next[index],
      quantity: roundQty(next[index].quantity + quantity),
    };
    return next;
  }
  return [
    ...next,
    {
      itemId: line.itemId,
      itemName: line.itemName,
      unit: line.unit,
      quantity: roundQty(quantity),
    },
  ];
}

function takeFromTruckStock(
  stock: TruckStockItem[],
  itemId: string,
  quantity: number,
  truckName: string
): { stock: TruckStockItem[]; taken: JobMaterial } {
  const index = stock.findIndex((item) => item.itemId === itemId);
  if (index === -1) {
    throw new Error("That material is not on this truck");
  }
  const onTruck = stock[index];
  if (quantity > onTruck.quantity) {
    throw new Error(
      `Only ${onTruck.quantity} ${onTruck.unit} of ${onTruck.itemName} on ${truckName}`
    );
  }
  const left = roundQty(onTruck.quantity - quantity);
  const next =
    left <= 0
      ? stock.filter((_, i) => i !== index)
      : stock.map((item, i) =>
          i === index ? { ...item, quantity: left } : item
        );
  return {
    stock: next,
    taken: {
      itemId: onTruck.itemId,
      itemName: onTruck.itemName,
      quantity,
      unit: onTruck.unit,
    },
  };
}

function setMaterialQuantity(
  materials: JobMaterial[],
  line: JobMaterial,
  quantity: number
): JobMaterial[] {
  const next = [...materials];
  const index = next.findIndex((item) => item.itemId === line.itemId);
  if (quantity <= 0) {
    return index === -1 ? next : next.filter((_, i) => i !== index);
  }
  if (index >= 0) {
    next[index] = { ...next[index], quantity: roundQty(quantity) };
    return next;
  }
  return [...next, { ...line, quantity: roundQty(quantity) }];
}

function withBagCount(job: JobRecord, delta: number): JobRecord {
  if (delta === 0) return job;
  return {
    ...job,
    bagCount: Math.max(0, (job.bagCount || 0) + delta),
  };
}

/** Fix used qty on a job. Extra goes back on the truck; more comes off the truck. */
export async function correctJobMaterial(input: {
  jobId: string;
  itemId: string;
  quantity: number;
}): Promise<{ job: JobRecord; truck: Truck }> {
  const itemId = String(input.itemId || "");
  let quantity = roundQty(Number(input.quantity));
  if (!itemId) throw new Error("Select a material to edit");
  if (!Number.isFinite(quantity) || quantity < 0) {
    throw new Error("Quantity cannot be negative");
  }

  const data = await readData();
  const jobIndex = data.jobs.findIndex((job) => job.id === input.jobId);
  if (jobIndex === -1) throw new Error("Job not found");
  const job = data.jobs[jobIndex];
  if (!job.truckId) throw new Error("Job has no truck assigned");

  const current = (job.materials || []).find((item) => item.itemId === itemId);
  if (!current) throw new Error("That material is not on this job");
  if (isBagMaterial(current)) {
    quantity = Math.floor(quantity);
  }
  if (current.quantity === quantity) {
    const truck = data.trucks.find((entry) => entry.id === job.truckId);
    if (!truck) throw new Error("Truck not found");
    return { job, truck };
  }

  const truckIndex = data.trucks.findIndex((entry) => entry.id === job.truckId);
  if (truckIndex === -1) throw new Error("Truck not found");
  const truck = data.trucks[truckIndex];
  let stock = [...(truck.stock || [])];
  const delta = quantity - current.quantity;

  if (delta < 0) {
    stock = putOnTruckStock(stock, current, -delta);
  } else {
    const taken = takeFromTruckStock(stock, itemId, delta, truck.name);
    stock = taken.stock;
  }

  const stamped = nowIso();
  let nextJob: JobRecord = {
    ...job,
    materials: setMaterialQuantity(job.materials || [], current, quantity),
    updatedAt: stamped,
  };
  if (isBagMaterial(current)) {
    nextJob = withBagCount(nextJob, delta);
  }

  const nextTruck: Truck = {
    ...truck,
    stock: stock.filter((item) => item.quantity > 0),
    updatedAt: stamped,
  };

  data.jobs[jobIndex] = nextJob;
  data.trucks[truckIndex] = nextTruck;
  await writeData(data);
  return { job: nextJob, truck: nextTruck };
}

/** Move used material from one job to another on the same truck. */
export async function moveJobMaterial(input: {
  jobId: string;
  itemId: string;
  quantity?: number;
  toJobId: string;
}): Promise<{ job: JobRecord; otherJob: JobRecord; truck: Truck }> {
  const itemId = String(input.itemId || "");
  const toJobId = String(input.toJobId || "");
  if (!itemId) throw new Error("Select a material to move");
  if (!toJobId) throw new Error("Select the job it should be on");
  if (toJobId === input.jobId) {
    throw new Error("Pick a different job");
  }

  const data = await readData();
  const fromIndex = data.jobs.findIndex((job) => job.id === input.jobId);
  const toIndex = data.jobs.findIndex((job) => job.id === toJobId);
  if (fromIndex === -1 || toIndex === -1) throw new Error("Job not found");

  const fromJob = data.jobs[fromIndex];
  const toJob = data.jobs[toIndex];
  if (!fromJob.truckId || fromJob.truckId !== toJob.truckId) {
    throw new Error("Both jobs need to be on the same truck");
  }

  const current = (fromJob.materials || []).find((item) => item.itemId === itemId);
  if (!current) throw new Error("That material is not on this job");

  const quantity =
    input.quantity === undefined
      ? current.quantity
      : isBagMaterial(current)
        ? Math.floor(Number(input.quantity))
        : roundQty(Number(input.quantity));
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("Choose how much to move");
  }
  if (quantity > current.quantity) {
    throw new Error(
      `Only ${current.quantity} ${current.unit} of ${current.itemName} on this job`
    );
  }

  const truckIndex = data.trucks.findIndex((entry) => entry.id === fromJob.truckId);
  if (truckIndex === -1) throw new Error("Truck not found");

  const stamped = nowIso();
  const remaining = roundQty(current.quantity - quantity);
  let nextFrom: JobRecord = {
    ...fromJob,
    materials: setMaterialQuantity(fromJob.materials || [], current, remaining),
    updatedAt: stamped,
  };
  let nextTo: JobRecord = {
    ...toJob,
    materials: setMaterialQuantity(
      toJob.materials || [],
      current,
      roundQty(
        ((toJob.materials || []).find((item) => item.itemId === itemId)?.quantity ||
          0) + quantity
      )
    ),
    updatedAt: stamped,
  };
  if (isBagMaterial(current)) {
    nextFrom = withBagCount(nextFrom, -quantity);
    nextTo = withBagCount(nextTo, quantity);
  }

  data.jobs[fromIndex] = nextFrom;
  data.jobs[toIndex] = nextTo;
  await writeData(data);
  return {
    job: nextFrom,
    otherJob: nextTo,
    truck: data.trucks[truckIndex],
  };
}

export async function listCheckouts(): Promise<CheckoutRecord[]> {
  const data = await readData();
  return [...(data.checkouts || [])].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export async function listCategories(): Promise<Category[]> {
  const data = await readData();
  return data.categories.sort((a, b) => a.name.localeCompare(b.name));
}

export async function createCategory(name: string): Promise<Category> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Category name is required");

  const data = await readData();
  const exists = data.categories.some(
    (c) => c.name.toLowerCase() === trimmed.toLowerCase()
  );
  if (exists) throw new Error("A category with that name already exists");

  const stamped = nowIso();
  const category: Category = {
    id: randomUUID(),
    name: trimmed,
    createdAt: stamped,
    updatedAt: stamped,
  };
  data.categories.push(category);
  await writeData(data);
  return category;
}

export async function updateCategory(
  id: string,
  name: string
): Promise<Category | null> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Category name is required");

  const data = await readData();
  const index = data.categories.findIndex((c) => c.id === id);
  if (index === -1) return null;

  const exists = data.categories.some(
    (c) => c.id !== id && c.name.toLowerCase() === trimmed.toLowerCase()
  );
  if (exists) throw new Error("A category with that name already exists");

  const next: Category = {
    ...data.categories[index],
    name: trimmed,
    updatedAt: nowIso(),
  };
  data.categories[index] = next;
  await writeData(data);
  return next;
}

export async function deleteCategory(
  id: string,
  reassignTo?: string
): Promise<{ ok: true; reassignedTo: string } | { ok: false; error: string }> {
  const data = await readData();
  if (data.categories.length <= 1) {
    return { ok: false, error: "Keep at least one category" };
  }

  const exists = data.categories.some((c) => c.id === id);
  if (!exists) return { ok: false, error: "Category not found" };

  const fallback =
    reassignTo &&
    reassignTo !== id &&
    data.categories.some((c) => c.id === reassignTo)
      ? reassignTo
      : data.categories.find((c) => c.id !== id)?.id;

  if (!fallback) {
    return { ok: false, error: "No category available to reassign items" };
  }

  data.items = data.items.map((item) =>
    item.category === id ? { ...item, category: fallback, updatedAt: nowIso() } : item
  );
  data.categories = data.categories.filter((c) => c.id !== id);
  await writeData(data);
  return { ok: true, reassignedTo: fallback };
}

export async function getSettings(): Promise<AppSettings> {
  const data = await readData();
  return {
    ...defaultSettings,
    ...data.settings,
    smtpHost: data.settings.smtpHost || process.env.SMTP_HOST || "",
    smtpPort: data.settings.smtpPort || Number(process.env.SMTP_PORT || 587),
    smtpUser: data.settings.smtpUser || process.env.SMTP_USER || "",
    smtpPass: data.settings.smtpPass || process.env.SMTP_PASS || "",
    smtpFrom: data.settings.smtpFrom || process.env.SMTP_FROM || "",
  };
}

export async function updateSettings(
  patch: Partial<AppSettings>
): Promise<AppSettings> {
  const data = await readData();
  data.settings = { ...data.settings, ...patch };
  await writeData(data);
  return data.settings;
}

export async function markAlertSent(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const data = await readData();
  const stamped = nowIso();
  data.items = data.items.map((item) =>
    ids.includes(item.id) ? { ...item, lastAlertSentAt: stamped } : item
  );
  await writeData(data);
}

export async function listLineItemTemplates(): Promise<LineItemTemplate[]> {
  const data = await readData();
  return [...(data.lineItemTemplates || [])].sort((a, b) =>
    a.name.localeCompare(b.name)
  );
}

export async function getLineItemTemplate(
  id: string
): Promise<LineItemTemplate | null> {
  const data = await readData();
  return data.lineItemTemplates.find((t) => t.id === id) ?? null;
}

export async function createLineItemTemplate(input: {
  name: string;
  notes?: string;
  materials?: LineItemTemplateMaterial[];
}): Promise<LineItemTemplate> {
  const name = String(input.name || "").trim();
  if (!name) throw new Error("Template name is required");

  const data = await readData();
  const materials = resolveTemplateMaterials(
    data.items,
    input.materials || []
  );
  if (materials.length === 0) {
    throw new Error("Add at least one material with a quantity");
  }

  const dup = data.lineItemTemplates.some(
    (t) => t.name.toLowerCase() === name.toLowerCase()
  );
  if (dup) {
    throw new Error("A template with that Jobber line name already exists");
  }

  const stamped = nowIso();
  const template: LineItemTemplate = {
    id: randomUUID(),
    name,
    notes: String(input.notes || "").trim(),
    materials,
    createdAt: stamped,
    updatedAt: stamped,
  };
  data.lineItemTemplates = [template, ...data.lineItemTemplates];
  await writeData(data);
  return template;
}

export async function updateLineItemTemplate(
  id: string,
  patch: {
    name?: string;
    notes?: string;
    materials?: LineItemTemplateMaterial[];
  }
): Promise<LineItemTemplate | null> {
  const data = await readData();
  const index = data.lineItemTemplates.findIndex((t) => t.id === id);
  if (index === -1) return null;

  const current = data.lineItemTemplates[index];
  const name =
    patch.name !== undefined ? String(patch.name).trim() : current.name;
  if (!name) throw new Error("Template name is required");

  const dup = data.lineItemTemplates.some(
    (t) => t.id !== id && t.name.toLowerCase() === name.toLowerCase()
  );
  if (dup) {
    throw new Error("A template with that Jobber line name already exists");
  }

  const materials =
    patch.materials !== undefined
      ? resolveTemplateMaterials(data.items, patch.materials)
      : current.materials;
  if (materials.length === 0) {
    throw new Error("Add at least one material with a quantity");
  }

  const next: LineItemTemplate = {
    ...current,
    name,
    notes:
      patch.notes !== undefined ? String(patch.notes).trim() : current.notes,
    materials,
    updatedAt: nowIso(),
  };
  data.lineItemTemplates[index] = next;
  await writeData(data);
  return next;
}

export async function deleteLineItemTemplate(id: string): Promise<boolean> {
  const data = await readData();
  const before = data.lineItemTemplates.length;
  data.lineItemTemplates = data.lineItemTemplates.filter((t) => t.id !== id);
  if (data.lineItemTemplates.length === before) return false;
  await writeData(data);
  return true;
}

function resolveTemplateMaterials(
  items: InventoryItem[],
  materials: LineItemTemplateMaterial[]
): LineItemTemplateMaterial[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const resolved: LineItemTemplateMaterial[] = [];
  for (const m of materials || []) {
    const item = byId.get(String(m.itemId || ""));
    if (!item) continue;
    const calcMode = normalizeCalcMode(m.calcMode);
    const qty = Number(m.quantity);
    const coverage = Number(m.coverageSqft);
    if (calcMode === "sqft_coverage") {
      if (!Number.isFinite(coverage) || coverage <= 0) continue;
      resolved.push({
        itemId: item.id,
        itemName: item.name,
        unit: item.unit,
        calcMode,
        quantity: 0,
        coverageSqft: Math.round(coverage * 1000) / 1000,
      });
    } else {
      if (!Number.isFinite(qty) || qty <= 0) continue;
      resolved.push({
        itemId: item.id,
        itemName: item.name,
        unit: item.unit,
        calcMode: "per_line",
        quantity: Math.round(qty * 1000) / 1000,
        coverageSqft: 0,
      });
    }
  }
  return normalizeTemplateMaterials(resolved);
}

export async function getJobberConnection(): Promise<JobberConnection | null> {
  const data = await readData();
  return data.jobber ?? null;
}

export async function setJobberConnection(
  connection: JobberConnection | null
): Promise<void> {
  const data = await readData();
  data.jobber = connection;
  await writeData(data);
}

export async function getJobberStatus(): Promise<{
  configured: boolean;
  connected: boolean;
  accountName: string;
  connectedAt: string;
}> {
  const { jobberConfigured } = await import("./jobber");
  const [connection, configured] = await Promise.all([
    getJobberConnection(),
    jobberConfigured(),
  ]);
  return {
    configured,
    connected: Boolean(connection?.accessToken),
    accountName: connection?.accountName || "",
    connectedAt: connection?.connectedAt || "",
  };
}
