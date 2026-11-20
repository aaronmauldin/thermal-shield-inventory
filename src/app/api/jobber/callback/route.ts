import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { setJobberConnection } from "@/lib/db";
import { exchangeAuthorizationCode } from "@/lib/jobber";

const COOKIE = "jobber_oauth";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  const fail = (message: string) =>
    NextResponse.redirect(
      new URL(`/estimates?error=${encodeURIComponent(message)}`, request.url)
    );

  if (oauthError) {
    return fail(oauthError);
  }
  if (!code || !state) {
    return fail("Missing Jobber authorization code");
  }

  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  jar.delete(COOKIE);

  if (!raw) {
    return fail("OAuth session expired — try Connect again");
  }

  let saved: { state: string; verifier: string; redirectUri: string };
  try {
    saved = JSON.parse(raw);
  } catch {
    return fail("Invalid OAuth session");
  }

  if (saved.state !== state) {
    return fail("OAuth state mismatch — try Connect again");
  }

  try {
    const connection = await exchangeAuthorizationCode({
      code,
      redirectUri: saved.redirectUri,
      codeVerifier: saved.verifier,
    });
    await setJobberConnection(connection);
    return NextResponse.redirect(
      new URL("/estimates?connected=1", request.url)
    );
  } catch (err) {
    return fail(
      err instanceof Error ? err.message : "Could not connect Jobber"
    );
  }
}
