import { notFound } from "next/navigation";
import { ItemForm } from "@/components/ItemForm";
import { getItem, listCategories } from "@/lib/db";
import { requireAdminPage } from "@/lib/guard";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function EditItemPage({ params }: Props) {
  await requireAdminPage();
  const { id } = await params;
  const [item, categories] = await Promise.all([getItem(id), listCategories()]);
  if (!item) notFound();

  return (
    <div className="animate-rise">
      <h1 className="page-title">Edit material</h1>
      <p className="page-sub">Update counts, location, or alert threshold.</p>
      <ItemForm item={item} categories={categories} />
    </div>
  );
}
