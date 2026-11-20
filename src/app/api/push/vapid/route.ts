import { NextResponse } from "next/server";
import { getVapidPublicKey, isPushConfigured } from "@/lib/push";
import { requireAdmin } from "@/lib/guard";

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;
  const configured = await isPushConfigured();
  const publicKey = configured ? await getVapidPublicKey() : "";
  return NextResponse.json({ configured, publicKey });
}
