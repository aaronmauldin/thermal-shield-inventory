import { NextResponse } from "next/server";
import {
  addInsulationBags,
  getInsulationTally,
  resetInsulationTally,
} from "@/lib/db";
import { assignedTruckIds } from "@/lib/auth";
import { requireUser, forbidWrongTruck } from "@/lib/guard";
import { stockMissingResponse } from "@/lib/stock-missing-response";

function crewTruckId(
  user: { role: string; truckId?: string | null; truckIds?: string[] } | null,
  requested: string | null | undefined
) {
  if (user?.role !== "crew") return requested || null;
  const assigned = assignedTruckIds(user);
  if (requested && assigned.includes(requested)) return requested;
  if (assigned.length === 1) return assigned[0];
  return requested || null;
}

export async function GET(request: Request) {
  const { user, error } = await requireUser();
  if (error) return error;
  const requested = new URL(request.url).searchParams.get("truckId");
  const truckId = crewTruckId(user, requested);
  const denied = forbidWrongTruck(user, requested || truckId);
  if (denied) return denied;
  try {
    return NextResponse.json(await getInsulationTally(truckId));
  } catch (err) {
    const missing = stockMissingResponse(err);
    if (missing) return missing;
    throw err;
  }
}

export async function POST(request: Request) {
  const { user, error } = await requireUser();
  if (error) return error;
  try {
    const body = await request.json();
    const requested = String(body.truckId || "").trim() || null;
    const truckId = crewTruckId(user, requested);
    const denied = forbidWrongTruck(user, requested || truckId);
    if (denied) return denied;
    if (body.reset) {
      return NextResponse.json(await resetInsulationTally(truckId));
    }
    const tally = await addInsulationBags({
      bags: Number(body.bags),
      note: String(body.note || ""),
      employeeName: String(body.employeeName || ""),
      truckId,
    });
    return NextResponse.json(tally, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not update tally" },
      { status: 400 }
    );
  }
}
