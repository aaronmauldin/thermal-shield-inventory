import { TemplateManager } from "@/components/TemplateManager";
import { PageHeading, TemplateEmblem } from "@/components/Emblems";
import { StockMissingNotice } from "@/components/StockMissingNotice";
import { listItems, listLineItemTemplates } from "@/lib/db";
import { requireAdminPage } from "@/lib/guard";
import { isStockDataMissing } from "@/lib/stock-missing";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  await requireAdminPage();
  let templates;
  let items;
  try {
    [templates, items] = await Promise.all([
      listLineItemTemplates(),
      listItems(),
    ]);
  } catch (err) {
    if (isStockDataMissing(err)) return <StockMissingNotice showSettingsLink />;
    throw err;
  }

  return (
    <div className="animate-rise">
      <PageHeading
        title="Line item templates"
        tone="teal"
        icon={TemplateEmblem}
      />
      <p className="page-sub">
        Map each Jobber line item name to the materials and quantities you need.
      </p>
      <TemplateManager initialTemplates={templates} items={items} />
    </div>
  );
}
