import { NextResponse } from "next/server";
import { createCategory, listCategories } from "@/lib/db";
import { requireAdmin, requireUser } from "@/lib/guard";
import { stockMissingResponse } from "@/lib/stock-missing-response";

export async function GET() {
  const { error } = await requireUser();
  if (error) return error;
  try {
    const categories = await listCategories();
    return NextResponse.json(categories);
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
    const category = await createCategory(String(body.name || ""));
    return NextResponse.json(category, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not create category" },
      { status: 400 }
    );
  }
}
