import { NextResponse } from "next/server";
import { createCategory, listCategories } from "@/lib/db";
import { requireAdmin, requireUser } from "@/lib/guard";

export async function GET() {
  const { error } = await requireUser();
  if (error) return error;
  const categories = await listCategories();
  return NextResponse.json(categories);
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
