import { timingSafeEqual } from "crypto";

const MAX_CODE_CHARS = 256;

async function readRestoreCode(): Promise<string> {
  const fromProcess = String(process.env.RESTORE_CODE || "").trim();
  if (fromProcess) return fromProcess;
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const ctx = await Promise.race([
      getCloudflareContext({ async: true }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500)),
    ]);
    if (!ctx) return "";
    const value = (ctx.env as unknown as Record<string, unknown>).RESTORE_CODE;
    return typeof value === "string" ? value.trim() : "";
  } catch {
    return "";
  }
}

function codesMatch(submitted: string, expected: string): boolean {
  const left = Buffer.from(submitted);
  const right = Buffer.from(expected);
  const length = Math.max(left.length, right.length, 1);
  const paddedLeft = Buffer.alloc(length);
  const paddedRight = Buffer.alloc(length);
  left.copy(paddedLeft);
  right.copy(paddedRight);
  return timingSafeEqual(paddedLeft, paddedRight) && left.length === right.length;
}

export async function checkRestoreCode(
  submitted: string
): Promise<"ok" | "unset" | "wrong"> {
  const expected = await readRestoreCode();
  if (!expected) return "unset";
  if (
    submitted.length > MAX_CODE_CHARS ||
    expected.length > MAX_CODE_CHARS ||
    !codesMatch(submitted, expected)
  ) {
    return "wrong";
  }
  return "ok";
}
