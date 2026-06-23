import { PageHeader } from "@/components/layout/page-header";
import { SettingsForm } from "@/components/settings/settings-form";
import { getCompanySettings } from "@/lib/data";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const settings = await getCompanySettings();

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Settings"
        description="Company details shown on your invoices."
      />
      <SettingsForm settings={settings} />
    </div>
  );
}
