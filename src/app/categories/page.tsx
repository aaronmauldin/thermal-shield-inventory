import { CategoryManager } from "@/components/CategoryManager";
import { CategoryEmblem, PageHeading } from "@/components/Emblems";
import { StockMissingNotice } from "@/components/StockMissingNotice";
import { listCategories, listItems } from "@/lib/db";
import { requireAdminPage } from "@/lib/guard";
import { isStockDataMissing } from "@/lib/stock-missing";

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  await requireAdminPage();
  let categories;
  let items;
  try {
    [categories, items] = await Promise.all([listCategories(), listItems()]);
  } catch (err) {
    if (isStockDataMissing(err)) return <StockMissingNotice showSettingsLink />;
    throw err;
  }

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
