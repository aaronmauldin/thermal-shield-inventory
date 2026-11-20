import { sendLowStockAlerts } from "./email";

/**
 * Prefer Cloudflare waitUntil so the Worker doesn't kill the push mid-send
 * after the HTTP response is returned. Fall back to awaiting locally.
 */
export async function triggerLowStockAlerts(
  force = false,
  forceIds: string[] = []
): Promise<void> {
  const work = sendLowStockAlerts(force, forceIds)
    .then(() => undefined)
    .catch(() => undefined);

  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { ctx } = await getCloudflareContext({ async: true });
    if (ctx && typeof ctx.waitUntil === "function") {
      ctx.waitUntil(work);
      return;
    }
  } catch {
    /* local / non-CF */
  }

  await work;
}

/** Await the full alert send (email + push) — use when the client needs the result. */
export async function sendLowStockAlertsNow(
  force = false,
  forceIds: string[] = []
) {
  return sendLowStockAlerts(force, forceIds);
}
