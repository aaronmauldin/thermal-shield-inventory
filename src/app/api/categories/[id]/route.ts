import { NextResponse } from "next/server";
import { deleteCategory, updateCategory } from "@/lib/db";
import { requireAdmin } from "@/lib/guard";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { error } = await requireAdmin();
  if (error) return error;
  try {
    const { id } = await params;
    const body = await request.json();
    const category = await updateCategory(id, String(body.name || ""));
    if (!category) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(category);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not update category" },
      { status: 400 }
    );
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const { error } = await requireAdmin();
  if (error) return error;
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const result = await deleteCategory(id, body?.reassignTo);

  if (!result.ok) {
    const status = result.error === "Category not found" ? 404 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json(result);
}
