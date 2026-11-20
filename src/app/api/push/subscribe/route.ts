import { NextResponse } from "next/server";
import {
  listPushSubscriptions,
  removePushSubscription,
  upsertPushSubscription,
} from "@/lib/push";
import { requireAdmin } from "@/lib/guard";

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;
  const subs = await listPushSubscriptions();
  return NextResponse.json({ count: subs.length });
}

export async function POST(request: Request) {
  const { error } = await requireAdmin();
  if (error) return error;
  const body = await request.json().catch(() => null);
  const endpoint = String(body?.endpoint || "").trim();
  const p256dh = String(body?.keys?.p256dh || "").trim();
  const auth = String(body?.keys?.auth || "").trim();

  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json(
      { error: "Invalid push subscription" },
      { status: 400 }
    );
  }

  const saved = await upsertPushSubscription({
    endpoint,
    keys: { p256dh, auth },
    userAgent: request.headers.get("user-agent") || undefined,
  });

  return NextResponse.json({ ok: true, endpoint: saved.endpoint });
}

export async function DELETE(request: Request) {
  const { error } = await requireAdmin();
  if (error) return error;
  const body = await request.json().catch(() => null);
  const endpoint = String(body?.endpoint || "").trim();
  if (!endpoint) {
    return NextResponse.json({ error: "endpoint required" }, { status: 400 });
  }
  const removed = await removePushSubscription(endpoint);
  return NextResponse.json({ ok: removed });
}
