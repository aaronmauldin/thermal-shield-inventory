import { NextResponse } from "next/server";
import {
  deleteLineItemTemplate,
  getLineItemTemplate,
  updateLineItemTemplate,
} from "@/lib/db";
import { requireAdmin } from "@/lib/guard";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { error } = await requireAdmin();
  if (error) return error;
  const { id } = await params;
  const template = await getLineItemTemplate(id);
  if (!template) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(template);
}

export async function PATCH(request: Request, { params }: Params) {
  const { error } = await requireAdmin();
  if (error) return error;
  try {
    const { id } = await params;
    const body = await request.json();
    const template = await updateLineItemTemplate(id, {
      name: body.name !== undefined ? String(body.name) : undefined,
      notes: body.notes !== undefined ? String(body.notes) : undefined,
      materials: Array.isArray(body.materials) ? body.materials : undefined,
    });
    if (!template) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(template);
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Could not update template",
      },
      { status: 400 }
    );
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { error } = await requireAdmin();
  if (error) return error;
  const { id } = await params;
  const ok = await deleteLineItemTemplate(id);
  if (!ok) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
