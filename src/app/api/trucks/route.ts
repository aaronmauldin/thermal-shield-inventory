import { NextResponse } from "next/server";
import { createTruck, listTrucks } from "@/lib/db";
import { assignedTruckIds } from "@/lib/auth";
import { requireAdmin, requireUser } from "@/lib/guard";

export async function GET() {
  const { user, error } = await requireUser();
  if (error) return error;
  const trucks = await listTrucks();
  if (user?.role === "crew") {
    const assigned = assignedTruckIds(user);
    return NextResponse.json(
      trucks.filter((truck) => assigned.includes(truck.id))
    );
  }
  return NextResponse.json(trucks);
}

export async function POST(request: Request) {
  const { error } = await requireAdmin();
  if (error) return error;
  try {
    const body = await request.json();
    const truck = await createTruck({
      name: String(body.name || ""),
      notes: String(body.notes || ""),
      jobberNames: body.jobberNames,
    });
    return NextResponse.json(truck, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not create truck" },
      { status: 400 }
    );
  }
}
