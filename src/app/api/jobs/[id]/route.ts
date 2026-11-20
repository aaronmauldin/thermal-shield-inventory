import { NextResponse } from "next/server";
import {
  addBagsToJob,
  correctJobMaterial,
  deleteJob,
  estimateJobMaterialCost,
  getJob,
  moveJobMaterial,
  updateJob,
  useTruckMaterialsOnJob,
} from "@/lib/db";
import { requireUser, forbidWrongTruck } from "@/lib/guard";
import { stockMissingResponse } from "@/lib/stock-missing-response";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { user, error } = await requireUser();
  if (error) return error;
  const { id } = await params;
  try {
    const job = await getJob(id);
    if (!job) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const denied = forbidWrongTruck(user, job.truckId);
    if (denied) return denied;
    return NextResponse.json(job);
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
    const existing = await getJob(id);
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const denied = forbidWrongTruck(user, existing.truckId);
    if (denied) return denied;
    const body = await request.json();
    const crew = user?.role !== "admin";

    // Use materials from truck stock (removes them off the truck)
    if (body.useFromTruck && Array.isArray(body.lines)) {
      const result = await useTruckMaterialsOnJob({
        jobId: id,
        lines: body.lines,
      });
      return NextResponse.json(result);
    }

    // Insulation bag tally on this job — subtracts bags from truck stock
    if (body.addBags) {
      const result = await addBagsToJob({
        jobId: id,
        bags: Number(body.bags),
        employeeName: String(body.employeeName || ""),
        itemId: body.itemId || undefined,
      });
      return NextResponse.json(result);
    }

    if (body.correctMaterial) {
      const result = await correctJobMaterial({
        jobId: id,
        itemId: String(body.itemId || ""),
        quantity: Number(body.quantity),
      });
      return NextResponse.json(result);
    }

    if (body.moveMaterial) {
      const result = await moveJobMaterial({
        jobId: id,
        itemId: String(body.itemId || ""),
        quantity:
          body.quantity !== undefined ? Number(body.quantity) : undefined,
        toJobId: String(body.toJobId || ""),
      });
      return NextResponse.json(result);
    }

    if (
      body.name !== undefined ||
      body.location !== undefined ||
      body.notes !== undefined
    ) {
      const job = await updateJob(id, {
        name: body.name !== undefined ? String(body.name) : undefined,
        location: body.location !== undefined ? String(body.location) : undefined,
        notes: body.notes !== undefined ? String(body.notes) : undefined,
      });
      if (!job) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      return NextResponse.json({ job });
    }

    if (crew) {
      return NextResponse.json({ error: "Admins only" }, { status: 403 });
    }

    // Fill material cost from inventory unit costs × quantities used
    if (body.estimateMaterialCost) {
      const estimated = await estimateJobMaterialCost(id);
      const job = await updateJob(id, { materialCost: estimated });
      if (!job) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      return NextResponse.json({ job, estimated });
    }

    const job = await updateJob(id, {
      name: body.name !== undefined ? String(body.name) : undefined,
      location: body.location !== undefined ? String(body.location) : undefined,
      notes: body.notes !== undefined ? String(body.notes) : undefined,
      materials: Array.isArray(body.materials) ? body.materials : undefined,
      amountCharged:
        body.amountCharged !== undefined
          ? Number(body.amountCharged)
          : undefined,
      materialCost:
        body.materialCost !== undefined
          ? Number(body.materialCost)
          : undefined,
    });
    if (!job) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(job);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not update job" },
      { status: 400 }
    );
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { user, error } = await requireUser();
  if (error) return error;
  const { id } = await params;
  try {
    const job = await getJob(id);
    if (!job) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const denied = forbidWrongTruck(user, job.truckId);
    if (denied) return denied;
    const ok = await deleteJob(id);
    if (!ok) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const missing = stockMissingResponse(err);
    if (missing) return missing;
    throw err;
  }
}
