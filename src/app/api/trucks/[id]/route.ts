import { NextResponse } from "next/server";
import {
  deleteTruck,
  getTruck,
  getTruckStock,
  listJobs,
  listTrucks,
  updateTruck,
} from "@/lib/db";
import { requireAdmin, requireUser, forbidWrongTruck } from "@/lib/guard";
import { clearTruckAssignments } from "@/lib/auth";
import { stockMissingResponse } from "@/lib/stock-missing-response";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { user, error } = await requireUser();
  if (error) return error;
  const { id } = await params;
  const denied = forbidWrongTruck(user, id);
  if (denied) return denied;
  try {
    const truck = await getTruck(id);
    if (!truck) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const [jobs, stock, trucks] = await Promise.all([
      listJobs(id),
      getTruckStock(id),
      listTrucks(),
    ]);
    const otherTrucks = trucks
      .filter((row) => row.id !== id)
      .map((row) => ({ id: row.id, name: row.name }));
    return NextResponse.json({ truck, jobs, stock, otherTrucks });
  } catch (err) {
    const missing = stockMissingResponse(err);
    if (missing) return missing;
    throw err;
  }
}

export async function PATCH(request: Request, { params }: Params) {
  const { user, error } = await requireUser();
  if (error) return error;
  try {
    const { id } = await params;
    const denied = forbidWrongTruck(user, id);
    if (denied) return denied;
    const body = await request.json();
    const truck = await updateTruck(id, {
      name: body.name !== undefined ? String(body.name) : undefined,
      notes: body.notes !== undefined ? String(body.notes) : undefined,
      jobberNames:
        user?.role === "admin" && body.jobberNames !== undefined
          ? body.jobberNames
          : undefined,
    });
    if (!truck) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(truck);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not update truck" },
      { status: 400 }
    );
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { error } = await requireAdmin();
  if (error) return error;
  const { id } = await params;
  const ok = await deleteTruck(id);
  if (!ok) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await clearTruckAssignments(id);
  return NextResponse.json({ ok: true });
}
