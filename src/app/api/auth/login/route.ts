import { NextResponse } from "next/server";
import {
  createUser,
  getSessionUser,
  login,
  userCount,
} from "@/lib/auth";

export async function GET() {
  const count = await userCount();
  return NextResponse.json({
    needsSetup: count === 0,
    user: count === 0 ? null : await getSessionUser(),
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const username = String(body.username || "");
    const password = String(body.password || "");
    const confirmPassword =
      body.confirmPassword !== undefined
        ? String(body.confirmPassword)
        : undefined;
    const count = await userCount();
    const secure = new URL(request.url).protocol === "https:";

    if (count === 0) {
      if (password.length < 6) {
        throw new Error("Password must be at least 6 characters");
      }
      const name = String(body.name || username || "Admin").trim();
      await createUser({
        name,
        username,
        password,
        role: "admin",
      });
      const result = await login(username, password, { secure });
      if (result.status !== "ok") {
        throw new Error("Could not sign in");
      }
      return NextResponse.json({ user: result.user, created: true });
    }

    const result = await login(username, password, {
      secure,
      confirmPassword,
    });
    if (result.status === "needs-password") {
      return NextResponse.json({
        needsPassword: true,
        name: result.name,
      });
    }
    if (result.status === "needs-existing-password") {
      return NextResponse.json({ needsPassword: false });
    }
    return NextResponse.json({ user: result.user, created: false });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not sign in" },
      { status: 400 }
    );
  }
}
