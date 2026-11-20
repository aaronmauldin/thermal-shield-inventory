import { NextResponse } from "next/server";
import { seedDemoUsageJobs } from "@/lib/db";
import { requireAdmin } from "@/lib/guard";

export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }
  const { error } = await requireAdmin();
  if (error) return error;
  try {
    const result = await seedDemoUsageJobs();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not add sample jobs" },
      { status: 400 }
    );
  }
}
