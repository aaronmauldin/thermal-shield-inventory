import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/guard";
import {
  buildAuthorizeUrl,
  createPkcePair,
  disconnectJobberRemote,
  jobberConfigured,
  jobberRedirectUri,
} from "@/lib/jobber";

const COOKIE = "jobber_oauth";

export async function GET(request: Request) {
  const { error } = await requireAdmin();
  if (error) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (!(await jobberConfigured())) {
    return NextResponse.redirect(
      new URL(
        "/estimates?error=" +
          encodeURIComponent(
            "Add JOBBER_CLIENT_ID and JOBBER_CLIENT_SECRET first"
          ),
        request.url
      )
    );
  }

  const origin = new URL(request.url).origin;
  const redirectUri = await jobberRedirectUri(origin);
  try {
    await disconnectJobberRemote();
  } catch {
    // Continue to a fresh Jobber authorization even if the old link is already gone
  }
  const { verifier, challenge, state } = createPkcePair();

  const jar = await cookies();
  jar.set(
    COOKIE,
    JSON.stringify({ state, verifier, redirectUri }),
    {
      httpOnly: true,
      secure: origin.startsWith("https"),
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    }
  );

  return NextResponse.redirect(
    await buildAuthorizeUrl({ redirectUri, state, challenge })
  );
}
