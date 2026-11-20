import { NextResponse } from "next/server";
import { buildBackup, restoreBackup } from "@/lib/backup";
import { requireAdmin } from "@/lib/guard";
import { stockMissingResponse } from "@/lib/stock-missing-response";

const MAX_BACKUP_CHARS = 20_000_000;

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;
  try {
    const payload = await buildBackup();
    const body = JSON.stringify(payload, null, 2);
    const day = payload.exportedAt.slice(0, 10);
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="tsi-inv-backup-${day}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const missing = stockMissingResponse(err);
    if (missing) return missing;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not build backup" },
      { status: 400 }
    );
  }
}

export async function POST(request: Request) {
  const { error } = await requireAdmin();
  if (error) return error;
  try {
    const text = await request.text();
    if (text.length > MAX_BACKUP_CHARS) {
      return NextResponse.json(
        { error: "Backup file is too large" },
        { status: 400 }
      );
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return NextResponse.json(
        { error: "That file is not a TSI INV backup" },
        { status: 400 }
      );
    }
    const result = await restoreBackup(parsed);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const missing = stockMissingResponse(err);
    if (missing) return missing;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not restore backup" },
      { status: 400 }
    );
  }
}
