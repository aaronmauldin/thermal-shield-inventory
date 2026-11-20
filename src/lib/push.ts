import { buildPushHTTPRequest } from "@pushforge/builder";
import {
  loadPushSubscriptionsRaw,
  savePushSubscriptionsRaw,
} from "./storage";

export type StoredPushSubscription = {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  createdAt: string;
  userAgent?: string;
};

type VapidEnvKey = "VAPID_PUBLIC_KEY" | "VAPID_PRIVATE_KEY" | "VAPID_SUBJECT";

async function readEnv(key: VapidEnvKey): Promise<string> {
  const fromProcess = String(process.env[key] || "").trim();
  if (fromProcess) return fromProcess;
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    const value = (env as unknown as Record<string, unknown>)[key];
    return typeof value === "string" ? value.trim() : "";
  } catch {
    return "";
  }
}

export async function getVapidPublicKey(): Promise<string> {
  return readEnv("VAPID_PUBLIC_KEY");
}

async function getVapidPrivateJwk(): Promise<string> {
  return readEnv("VAPID_PRIVATE_KEY");
}

async function getVapidSubject(): Promise<string> {
  const subject = await readEnv("VAPID_SUBJECT");
  return subject || "mailto:alerts@tsi-inv.local";
}

export async function isPushConfigured(): Promise<boolean> {
  const [pub, priv] = await Promise.all([
    getVapidPublicKey(),
    getVapidPrivateJwk(),
  ]);
  return Boolean(pub && priv);
}

function isValidSubscription(input: unknown): input is StoredPushSubscription {
  if (!input || typeof input !== "object") return false;
  const sub = input as StoredPushSubscription;
  return (
    typeof sub.endpoint === "string" &&
    sub.endpoint.startsWith("https://") &&
    typeof sub.keys?.p256dh === "string" &&
    typeof sub.keys?.auth === "string"
  );
}

export async function listPushSubscriptions(): Promise<StoredPushSubscription[]> {
  const raw = await loadPushSubscriptionsRaw();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidSubscription);
  } catch {
    return [];
  }
}

async function writeSubscriptions(
  subs: StoredPushSubscription[]
): Promise<void> {
  await savePushSubscriptionsRaw(JSON.stringify(subs));
}

export async function upsertPushSubscription(input: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent?: string;
}): Promise<StoredPushSubscription> {
  if (!isValidSubscription({ ...input, createdAt: new Date().toISOString() })) {
    throw new Error("Invalid push subscription");
  }
  const subs = await listPushSubscriptions();
  const next: StoredPushSubscription = {
    endpoint: input.endpoint,
    keys: {
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
    },
    createdAt: new Date().toISOString(),
    userAgent: input.userAgent?.slice(0, 240) || undefined,
  };
  const without = subs.filter((s) => s.endpoint !== next.endpoint);
  without.push(next);
  // Keep the newest phones; avoid unbounded growth
  await writeSubscriptions(without.slice(-20));
  return next;
}

export async function removePushSubscription(endpoint: string): Promise<boolean> {
  const subs = await listPushSubscriptions();
  const next = subs.filter((s) => s.endpoint !== endpoint);
  if (next.length === subs.length) return false;
  await writeSubscriptions(next);
  return true;
}

export type PushPayload = {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  renotify?: boolean;
  requireInteraction?: boolean;
  data?: { url?: string };
};

export async function sendPushToAll(payload: PushPayload): Promise<{
  sent: number;
  failed: number;
  configured: boolean;
  reason?: string;
}> {
  if (!(await isPushConfigured())) {
    return {
      sent: 0,
      failed: 0,
      configured: false,
      reason: "Push is not configured (missing VAPID keys)",
    };
  }

  const subs = await listPushSubscriptions();
  if (subs.length === 0) {
    return {
      sent: 0,
      failed: 0,
      configured: true,
      reason: "No phones subscribed yet",
    };
  }

  const privateJWK = await getVapidPrivateJwk();
  const adminContact = await getVapidSubject();
  let sent = 0;
  let failed = 0;
  const keep: StoredPushSubscription[] = [];

  for (const subscription of subs) {
    try {
      const { endpoint, headers, body } = await buildPushHTTPRequest({
        privateJWK,
        subscription: {
          endpoint: subscription.endpoint,
          keys: subscription.keys,
        },
        message: {
          payload,
          adminContact,
          options: {
            ttl: 60 * 60 * 12,
            urgency: "high",
          },
        },
      });

      const res = await fetch(endpoint, {
        method: "POST",
        headers,
        body,
      });

      // Gone / Not Found = subscription expired
      if (res.status === 404 || res.status === 410) {
        failed += 1;
        continue;
      }
      if (!res.ok) {
        failed += 1;
        keep.push(subscription);
        continue;
      }
      sent += 1;
      keep.push(subscription);
    } catch {
      failed += 1;
      keep.push(subscription);
    }
  }

  if (keep.length !== subs.length) {
    await writeSubscriptions(keep);
  }

  return { sent, failed, configured: true };
}
