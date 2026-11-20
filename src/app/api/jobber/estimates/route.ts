import { NextResponse } from "next/server";
import { buildJobberEstimates } from "@/lib/jobber";
import { requireAdmin } from "@/lib/guard";

function isYmd(value: string | null): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function friendlyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : "Could not load upcoming material";
  if (/too many subrequests/i.test(msg)) {
    return "Cloudflare hit its request limit while loading Jobber. Tap Refresh once, then use Apply for date changes (cached for 15 min).";
  }
  if (/throttl/i.test(msg)) {
    return "Jobber is rate-limiting requests. Wait a few seconds and try again.";
  }
  return msg;
}

export async function GET(request: Request) {
  const { error } = await requireAdmin();
  if (error) return error;
  try {
    const url = new URL(request.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const includeUndated =
      url.searchParams.get("includeUndated") === "1" ||
      url.searchParams.get("includeUndated") === "true";
    const force =
      url.searchParams.get("force") === "1" ||
      url.searchParams.get("force") === "true";

    const range =
      isYmd(from) && isYmd(to)
        ? { from, to, includeUndated }
        : undefined;

    if (range && startMs(range.from) > endMs(range.to)) {
      return NextResponse.json(
        { error: "Start date must be on or before end date" },
        { status: 400 }
      );
    }

    const data = await buildJobberEstimates(range, { force });
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: friendlyError(err) }, { status: 400 });
  }
}

function startMs(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
}

function endMs(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
}
