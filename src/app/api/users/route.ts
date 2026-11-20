import { NextResponse } from "next/server";
import {
  createUser,
  deleteUser,
  listPublicUsers,
  resetUserPassword,
  updateUserTrucks,
} from "@/lib/auth";
import { requireAdmin } from "@/lib/guard";
import { getTruck, listTrucks } from "@/lib/db";
import type { UserRole } from "@/lib/types";

function parseTruckIds(body: {
  truckId?: unknown;
  truckIds?: unknown;
}): string[] {
  const fromList = Array.isArray(body.truckIds)
    ? body.truckIds.map((id) => String(id || "").trim()).filter(Boolean)
    : [];
  if (fromList.length) return [...new Set(fromList)];
  const single = String(body.truckId || "").trim();
  return single ? [single] : [];
}

async function assertTrucksExist(ids: string[]) {
  const trucks = await listTrucks();
  const known = new Set(trucks.map((truck) => truck.id));
  for (const id of ids) {
    if (!known.has(id)) {
      const truck = await getTruck(id);
      if (!truck) throw new Error("Select a valid truck");
    }
  }
}

export async function GET() {
  const { user, error } = await requireAdmin();
  if (error) return error;
  return NextResponse.json({ users: await listPublicUsers(), me: user });
}

export async function POST(request: Request) {
  const { error } = await requireAdmin();
  if (error) return error;
  try {
    const body = await request.json();
    const role = String(body.role || "crew") as UserRole;
    const truckIds = parseTruckIds(body);
    await assertTrucksExist(truckIds);
    const created = await createUser({
      name: String(body.name || ""),
      username: String(body.username || ""),
      role: role === "admin" ? "admin" : "crew",
      truckIds,
    });
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not create login" },
      { status: 400 }
    );
  }
}

export async function PATCH(request: Request) {
  const { error } = await requireAdmin();
  if (error) return error;
  try {
    const body = await request.json().catch(() => ({}));
    const id = String(body.id || "");
    if (!id) {
      return NextResponse.json({ error: "Login not found" }, { status: 404 });
    }
    if (body.resetPassword) {
      const updated = await resetUserPassword(id);
      if (!updated) {
        return NextResponse.json({ error: "Login not found" }, { status: 404 });
      }
      return NextResponse.json(updated);
    }
    if (body.truckIds !== undefined || body.truckId !== undefined) {
      const truckIds = parseTruckIds(body);
      await assertTrucksExist(truckIds);
      const updated = await updateUserTrucks(id, truckIds);
      if (!updated) {
        return NextResponse.json({ error: "Login not found" }, { status: 404 });
      }
      return NextResponse.json(updated);
    }
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not update login" },
      { status: 400 }
    );
  }
}

export async function DELETE(request: Request) {
  const { user, error } = await requireAdmin();
  if (error) return error;
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  try {
    const body = await request.json().catch(() => ({}));
    const id = String(body.id || "");
    const ok = await deleteUser(id, user.id);
    if (!ok) {
      return NextResponse.json({ error: "Login not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not delete login" },
      { status: 400 }
    );
  }
}
