import { BackupPanel } from "@/components/BackupPanel";
import { SettingsForm } from "@/components/SettingsForm";
import { StockMissingNotice } from "@/components/StockMissingNotice";
import { UserManager } from "@/components/UserManager";
import { PageHeading, SettingsEmblem } from "@/components/Emblems";
import { getSettings } from "@/lib/db";
import { requireAdminPage } from "@/lib/guard";
import { isStockDataMissing } from "@/lib/stock-missing";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requireAdminPage();
  let settings = null;
  let stockMissing = false;
  try {
    settings = await getSettings();
  } catch (err) {
    if (!isStockDataMissing(err)) throw err;
    stockMissing = true;
  }

  return (
    <div className="animate-rise">
      <PageHeading title="Alerts & company" tone="slate" icon={SettingsEmblem} />
      {stockMissing || !settings ? (
        <>
          <StockMissingNotice
            showSettingsLink={false}
            hint="Use the backup section on this page to restore a file."
          />
          <BackupPanel />
        </>
      ) : (
        <>
          <p className="page-sub">
            When any material hits its low threshold or runs out, TSI INV can email
            your shop and push a notification to phones that saved the app to the
            Home Screen.
          </p>
          <SettingsForm initialSettings={settings} />
          <UserManager />
          <BackupPanel />
        </>
      )}
    </div>
  );
}
