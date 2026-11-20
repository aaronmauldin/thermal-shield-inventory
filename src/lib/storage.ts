import { promises as fs } from "fs";
import path from "path";
import type { AppData } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "inventory.json");
const KV_KEY = "inventory-data";
const JOBBER_CACHE_KEY = "jobber-jobs-cache";
const JOBBER_CACHE_FILE = path.join(DATA_DIR, "jobber-jobs-cache.json");
const PUSH_SUBS_KEY = "push-subscriptions";
const PUSH_SUBS_FILE = path.join(DATA_DIR, "push-subscriptions.json");
const AUTH_KEY = "auth-data";
const AUTH_FILE = path.join(DATA_DIR, "auth.json");

type KvLike = {
  get: (key: string) => Promise<string | null>;
  put: (key: string, value: string) => Promise<void>;
};

async function getInventoryKv(): Promise<KvLike | null> {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    const kv = (env as { INVENTORY_KV?: KvLike }).INVENTORY_KV;
    return kv ?? null;
  } catch {
    return null;
  }
}

export async function loadRawData(): Promise<string | null> {
  const kv = await getInventoryKv();
  if (kv) {
    return kv.get(KV_KEY);
  }

  try {
    return await fs.readFile(DATA_FILE, "utf8");
  } catch {
    return null;
  }
}

export async function saveRawData(data: AppData): Promise<void> {
  const payload = JSON.stringify(data, null, 2);
  const kv = await getInventoryKv();
  if (kv) {
    await kv.put(KV_KEY, payload);
    return;
  }

  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DATA_FILE, payload, "utf8");
}

export async function loadJobberJobsCacheRaw(): Promise<string | null> {
  const kv = await getInventoryKv();
  if (kv) {
    return kv.get(JOBBER_CACHE_KEY);
  }
  try {
    return await fs.readFile(JOBBER_CACHE_FILE, "utf8");
  } catch {
    return null;
  }
}

export async function saveJobberJobsCacheRaw(payload: string): Promise<void> {
  const kv = await getInventoryKv();
  if (kv) {
    await kv.put(JOBBER_CACHE_KEY, payload);
    return;
  }
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(JOBBER_CACHE_FILE, payload, "utf8");
}

export async function loadPushSubscriptionsRaw(): Promise<string | null> {
  const kv = await getInventoryKv();
  if (kv) {
    return kv.get(PUSH_SUBS_KEY);
  }
  try {
    return await fs.readFile(PUSH_SUBS_FILE, "utf8");
  } catch {
    return null;
  }
}

export async function savePushSubscriptionsRaw(payload: string): Promise<void> {
  const kv = await getInventoryKv();
  if (kv) {
    await kv.put(PUSH_SUBS_KEY, payload);
    return;
  }
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(PUSH_SUBS_FILE, payload, "utf8");
}

export async function loadAuthRaw(): Promise<string | null> {
  const kv = await getInventoryKv();
  if (kv) {
    return kv.get(AUTH_KEY);
  }
  try {
    return await fs.readFile(AUTH_FILE, "utf8");
  } catch {
    return null;
  }
}

export async function saveAuthRaw(payload: string): Promise<void> {
  const kv = await getInventoryKv();
  if (kv) {
    await kv.put(AUTH_KEY, payload);
    return;
  }
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(AUTH_FILE, payload, "utf8");
}
