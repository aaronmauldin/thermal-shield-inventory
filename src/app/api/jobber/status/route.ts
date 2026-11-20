import { NextResponse } from "next/server";
import { getJobberStatus } from "@/lib/db";
import { requireAdmin } from "@/lib/guard";

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;
  return NextResponse.json(await getJobberStatus());
}
