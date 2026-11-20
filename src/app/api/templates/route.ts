import { NextResponse } from "next/server";
import { createLineItemTemplate, listLineItemTemplates } from "@/lib/db";
import { requireAdmin } from "@/lib/guard";
import { stockMissingResponse } from "@/lib/stock-missing-response";

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;
  try {
    return NextResponse.json(await listLineItemTemplates());
  } catch (err) {
    const missing = stockMissingResponse(err);
    if (missing) return missing;
    throw err;
  }
}

export async function POST(request: Request) {
  const { error } = await requireAdmin();
  if (error) return error;
  try {
    const body = await request.json();
    const template = await createLineItemTemplate({
      name: String(body.name || ""),
      notes: String(body.notes || ""),
      materials: Array.isArray(body.materials) ? body.materials : [],
    });
    return NextResponse.json(template, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Could not create template",
      },
      { status: 400 }
    );
  }
}
