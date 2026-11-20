import { NextResponse } from "next/server";
import { createJob, listJobs } from "@/lib/db";
import { assignedTruckIds } from "@/lib/auth";
import { forbidWrongTruck, requireUser } from "@/lib/guard";

export async function GET(request: Request) {
  const { user, error } = await requireUser();
  if (error) return error;
  const requested = new URL(request.url).searchParams.get("truckId") || undefined;
  if (user?.role === "crew") {
    const assigned = assignedTruckIds(user);
    const denied = forbidWrongTruck(user, requested);
    if (denied) return denied;
    if (assigned.length === 0) {
      return NextResponse.json({ error: "Admins only" }, { status: 403 });
    }
    return NextResponse.json(
      await listJobs(requested ? requested : assigned)
    );
  }
  return NextResponse.json(await listJobs(requested));
}

export async function POST(request: Request) {
  const { user, error } = await requireUser();
  if (error) return error;
  try {
    const body = await request.json();
    const assigned = assignedTruckIds(user || { truckIds: [] });
    const requested = String(body.truckId || "").trim() || null;
    const truckId =
      user?.role === "crew"
        ? requested && assigned.includes(requested)
          ? requested
          : assigned.length === 1
            ? assigned[0]
            : null
        : requested;
    const denied = forbidWrongTruck(user, truckId);
    if (denied) return denied;
    if (user?.role !== "admin" && !truckId) {
      return NextResponse.json(
        { error: "Jobs must be created on a truck" },
        { status: 403 }
      );
    }
    const job = await createJob({
      name: String(body.name || ""),
      location: String(body.location || ""),
      notes: String(body.notes || ""),
      truckId,
      materials: Array.isArray(body.materials) ? body.materials : [],
    });
    return NextResponse.json(job, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not create job" },
      { status: 400 }
    );
  }
}
