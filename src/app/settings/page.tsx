import { SettingsForm } from "@/components/SettingsForm";
import { UserManager } from "@/components/UserManager";
import { PageHeading, SettingsEmblem } from "@/components/Emblems";
import { getSettings } from "@/lib/db";
import { requireAdminPage } from "@/lib/guard";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requireAdminPage();
  const settings = await getSettings();

  return (
    <div className="animate-rise">
      <PageHeading title="Alerts & company" tone="slate" icon={SettingsEmblem} />
      <p className="page-sub">
        When any material hits its low threshold or runs out, TSI INV can email
        your shop and push a notification to phones that saved the app to the
        Home Screen.
      </p>
      <SettingsForm initialSettings={settings} />
      <UserManager />
    </div>
  );
}
