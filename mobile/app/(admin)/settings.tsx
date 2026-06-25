import {
  Card,
  LabelValue,
  MessageState,
  PrimaryButton,
  QueryBoundary,
  Screen,
  SectionTitle,
} from "@/src/components/ui";
import { BiometricSettingCard } from "@/src/components/biometric-setting";
import { getCompanySettings } from "@/src/lib/data";
import { useScreenQuery } from "@/src/hooks/use-screen-query";
import { useAuth } from "@/src/providers/auth-provider";

export default function SettingsScreen() {
  const { user, signOut } = useAuth();
  const query = useScreenQuery(getCompanySettings);

  return (
    <Screen
      title="Settings"
      subtitle="Account and company information. Editing remains in the web app."
      refreshing={query.refreshing}
      onRefresh={() => void query.refresh()}
    >
      <SectionTitle>Account</SectionTitle>
      <Card>
        <LabelValue label="Email" value={user?.email ?? "—"} />
        <LabelValue label="Access" value="Administrator" last />
      </Card>

      <BiometricSettingCard />

      <SectionTitle>Company</SectionTitle>
      <QueryBoundary
        loading={query.loading}
        error={query.error}
        hasData={Boolean(query.data)}
        retry={() => void query.retry()}
      >
        {query.data ? (
          <Card>
            <LabelValue label="Name" value={query.data.company_name} />
            <LabelValue label="Email" value={query.data.email ?? "—"} />
            <LabelValue label="Phone" value={query.data.phone ?? "—"} />
            <LabelValue
              label="Default tax"
              value={`${Number(query.data.tax_rate)}%`}
              last
            />
          </Card>
        ) : (
          <MessageState
            title="No company settings"
            message="Company settings can be configured in the web app."
          />
        )}
      </QueryBoundary>

      <PrimaryButton
        label="Sign out"
        variant="danger"
        onPress={() => void signOut()}
      />
    </Screen>
  );
}
