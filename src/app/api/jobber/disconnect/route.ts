import { NextResponse } from "next/server";
import { disconnectJobberRemote } from "@/lib/jobber";
import { requireAdmin } from "@/lib/guard";

export async function POST() {
  const { error } = await requireAdmin();
  if (error) return error;
  try {
    await disconnectJobberRemote();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Could not disconnect Jobber",
      },
      { status: 400 }
    );
  }
}
