import { TemplateManager } from "@/components/TemplateManager";
import { PageHeading, TemplateEmblem } from "@/components/Emblems";
import { listItems, listLineItemTemplates } from "@/lib/db";
import { requireAdminPage } from "@/lib/guard";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  await requireAdminPage();
  const [templates, items] = await Promise.all([
    listLineItemTemplates(),
    listItems(),
  ]);

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
