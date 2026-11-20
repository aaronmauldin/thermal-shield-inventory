import { CategoryManager } from "@/components/CategoryManager";
import { CategoryEmblem, PageHeading } from "@/components/Emblems";
import { listCategories, listItems } from "@/lib/db";
import { requireAdminPage } from "@/lib/guard";

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  await requireAdminPage();
  const [categories, items] = await Promise.all([
    listCategories(),
    listItems(),
  ]);

  const usageCounts = categories.reduce<Record<string, number>>((acc, cat) => {
    acc[cat.id] = items.filter((item) => item.category === cat.id).length;
    return acc;
  }, {});

  return (
    <div className="animate-rise">
      <PageHeading title="Categories" tone="teal" icon={CategoryEmblem} />
      <p className="page-sub">
        Add, rename, or remove material categories. Deleted categories move
        their items to another category.
      </p>
      <CategoryManager
        initialCategories={categories}
        usageCounts={usageCounts}
      />
    </div>
  );
}
