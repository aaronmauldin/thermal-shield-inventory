import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import {
  assignedTruckIds,
  getSessionUser,
  homeForRole,
  userCount,
  type PublicUser,
} from "@/lib/auth";

export async function requireUser() {
  const needsSetup = (await userCount()) === 0;
  if (needsSetup) {
    return {
      user: null as PublicUser | null,
      error: NextResponse.json(
        { error: "Create the first admin login" },
        { status: 401 }
      ),
    };
  }
  const user = await getSessionUser();
  if (!user) {
    return {
      user: null as PublicUser | null,
      error: NextResponse.json({ error: "Sign in required" }, { status: 401 }),
    };
  }
  return { user, error: null };
}

export async function requireAdmin() {
  const result = await requireUser();
  if (result.error) return result;
  if (result.user?.role !== "admin") {
    return {
      user: result.user,
      error: NextResponse.json(
        { error: "Admins only" },
        { status: 403 }
      ),
    };
  }
  return result;
}

export async function requireAdminPage() {
  if ((await userCount()) === 0) redirect("/login");
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect(homeForRole(user.role));
  return user;
}

export function forbidWrongTruck(
  user: PublicUser | null,
  truckId: string | null | undefined
) {
  if (user?.role !== "crew") return null;
  const assigned = assignedTruckIds(user);
  if (assigned.length === 0) {
    return NextResponse.json(
      { error: "No truck assigned — ask an admin" },
      { status: 403 }
    );
  }
  if (truckId && !assigned.includes(truckId)) {
    return NextResponse.json(
      { error: "That truck is not assigned to you" },
      { status: 403 }
    );
  }
  return null;
}
