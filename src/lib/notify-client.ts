"use client";

import { stockStatus, type InventoryItem } from "@/lib/types";

export type StockAlertNotice = {
  title: string;
  body: string;
};

export function stockAlertCopy(item: InventoryItem): StockAlertNotice | null {
  const status = stockStatus(item);
  if (status === "ok") return null;
  const label = status === "out" ? "OUT OF STOCK" : "LOW STOCK";
  return {
    title: `${label}: ${item.name}`,
    body: `${item.quantity} ${item.unit} left (alert at ${item.lowStockThreshold}).`,
  };
}

export async function showLocalStockNotification(notice: StockAlertNotice) {
  if (typeof window === "undefined") return;
  if (!("Notification" in window) || Notification.permission !== "granted") {
    return;
  }

  const options = {
    body: notice.body,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: "tsi-stock-local",
    renotify: true,
    requireInteraction: true,
    data: { url: "/" },
  } as NotificationOptions;

  try {
    const reg = await navigator.serviceWorker?.getRegistration("/");
    if (reg?.showNotification) {
      await reg.showNotification(notice.title, options);
      return;
    }
  } catch {
    /* fall through */
  }

  try {
    // eslint-disable-next-line no-new
    new Notification(notice.title, options);
  } catch {
    /* ignore */
  }
}

export async function clearAppBadge() {
  try {
    if ("clearAppBadge" in navigator) {
      await (
        navigator as Navigator & { clearAppBadge: () => Promise<void> }
      ).clearAppBadge();
    }
  } catch {
    /* ignore */
  }
}
