import { NextResponse } from "next/server";
import { getSessionUser, userCount } from "@/lib/auth";

export async function GET() {
  const count = await userCount();
  if (count === 0) {
    return NextResponse.json({ needsSetup: true, user: null });
  }
  const user = await getSessionUser();
  return NextResponse.json({ needsSetup: false, user });
}
