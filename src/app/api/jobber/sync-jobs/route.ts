import { NextResponse } from "next/server";
import { JOBBER_USERS_SCOPE_MESSAGE, syncJobberJobsToTrucks } from "@/lib/jobber";
import { requireAdmin, requireUser } from "@/lib/guard";

export async function POST(request: Request) {
  const { error } = await requireUser();
  if (error) return error;
  const body = await request.json().catch(() => ({}));
  return run(Boolean(body?.force), false);
}

export async function GET(request: Request) {
  const { error } = await requireAdmin();
  if (error) return error;
  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "1";
  const dryRun = url.searchParams.get("preview") === "1";
  return run(force, dryRun);
}

async function run(force: boolean, dryRun = false) {
  try {
    const result = await syncJobberJobsToTrucks({ force: force || dryRun, dryRun });
    return NextResponse.json(result);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not sync Jobber jobs";
    return NextResponse.json(
      {
        error: /User was hidden due to permissions/i.test(message)
          ? JOBBER_USERS_SCOPE_MESSAGE
          : message,
      },
      { status: 400 }
    );
  }
}
