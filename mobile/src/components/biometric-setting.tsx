import { useState } from "react";
import { Alert, StyleSheet, Switch, Text, View } from "react-native";

import { Card, SectionTitle } from "@/src/components/ui";
import { useBiometric } from "@/src/providers/biometric-provider";
import { colors, spacing } from "@/src/theme";

/**
 * Settings row to enable/disable the biometric app lock. Renders for both admin
 * and portal settings. Reflects device capability: when biometrics aren't set
 * up the toggle is disabled with an explanation. Enabling runs a live Face ID /
 * Touch ID prompt first (handled in the provider) so the user confirms it works.
 */
export function BiometricSettingCard() {
  const { available, ready, enabled, typeLabel, unavailableReason, setEnabled } =
    useBiometric();
  const [busy, setBusy] = useState(false);

  if (!ready) return null;

  async function onToggle(next: boolean) {
    setBusy(true);
    const error = await setEnabled(next);
    setBusy(false);
    if (error) {
      Alert.alert(
        next ? "Couldn't enable lock" : "Couldn't disable lock",
        error,
      );
    }
  }

  return (
    <>
      <SectionTitle>Security</SectionTitle>
      <Card>
        <View style={styles.row}>
          <View style={styles.text}>
            <Text style={styles.label}>{typeLabel}</Text>
            <Text style={styles.description}>
              {available
                ? `Require ${typeLabel} when you open or return to the app.`
                : (unavailableReason ?? "Biometric unlock is unavailable.")}
            </Text>
          </View>
          <Switch
            value={enabled}
            disabled={!available || busy}
            onValueChange={(next) => void onToggle(next)}
            trackColor={{ false: colors.surfaceRaised, true: colors.accent }}
            thumbColor={colors.white}
          />
        </View>
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
  },
  text: { flex: 1, gap: spacing.xs },
  label: { color: colors.text, fontSize: 16, fontWeight: "500" },
  description: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
});
