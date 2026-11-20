import { NextResponse } from "next/server";
import { sendPushToAll } from "@/lib/push";
import { requireAdmin } from "@/lib/guard";

/** Sends a remote push only — useful to test with the phone locked / app closed. */
export async function POST() {
  const { error } = await requireAdmin();
  if (error) return error;
  const result = await sendPushToAll({
    title: "TSI INV test push",
    body: "If you see this with the app closed or phone locked, remote push is working.",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: `tsi-test-${Date.now()}`,
    renotify: true,
    requireInteraction: true,
    data: { url: "/settings" },
  });

  if (!result.sent) {
    return NextResponse.json(
      {
        ok: false,
        reason: result.reason || "Push was not delivered",
        ...result,
      },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    ...result,
    tip: "Lock your phone or leave the app, then wait a few seconds.",
  });
}
