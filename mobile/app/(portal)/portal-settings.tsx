import {
  Card,
  LabelValue,
  PrimaryButton,
  Screen,
  SectionTitle,
} from "@/src/components/ui";
import { BiometricSettingCard } from "@/src/components/biometric-setting";
import { useAuth } from "@/src/providers/auth-provider";

export default function PortalSettingsScreen() {
  const { portalAccess, signOut, user } = useAuth();

  return (
    <Screen
      title="Settings"
      subtitle="Your portal account and access."
    >
      <SectionTitle>Account</SectionTitle>
      <Card>
        <LabelValue label="Email" value={user?.email ?? "—"} />
        <LabelValue label="Access" value="Client portal" />
        <LabelValue
          label="Uploads"
          value={portalAccess?.canUpload ? "Enabled" : "View only"}
          last
        />
      </Card>

      <BiometricSettingCard />

      <PrimaryButton
        label="Sign out"
        variant="danger"
        onPress={() => void signOut()}
      />
    </Screen>
  );
}
