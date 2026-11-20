import { NextResponse } from "next/server";
import { moveTruckStock, returnTruckStock } from "@/lib/db";
import { requireUser, forbidWrongTruck } from "@/lib/guard";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const { user, error } = await requireUser();
  if (error) return error;
  try {
    const { id } = await params;
    const denied = forbidWrongTruck(user, id);
    if (denied) return denied;
    const body = await request.json();
    const lines = Array.isArray(body.lines) ? body.lines : [];
    const employeeName = String(body.employeeName || "");
    const toTruckId = String(body.toTruckId || "").trim();
    const action =
      body.action === "move" || (toTruckId && toTruckId !== "warehouse")
        ? "move"
        : "return";

    if (action === "move") {
      const result = await moveTruckStock({
        fromTruckId: id,
        toTruckId,
        employeeName,
        lines,
      });
      return NextResponse.json(result);
    }

    const result = await returnTruckStock({
      truckId: id,
      employeeName,
      lines,
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Could not move material",
      },
      { status: 400 }
    );
  }
}
