import type { PropsWithChildren, ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { colors, radius, spacing } from "@/src/theme";
import type { InvoiceStatus } from "@/src/types/database";

export function Screen({
  title,
  subtitle,
  children,
  refreshing = false,
  onRefresh,
}: PropsWithChildren<{
  title: string;
  subtitle?: string;
  refreshing?: boolean;
  onRefresh?: () => void;
}>) {
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.screenContent}
      contentInsetAdjustmentBehavior="automatic"
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent}
          />
        ) : undefined
      }
    >
      <View style={styles.heading}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {children}
    </ScrollView>
  );
}

export function Card({
  children,
  style,
}: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionTitle({
  children,
  trailing,
}: PropsWithChildren<{ trailing?: ReactNode }>) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{children}</Text>
      {trailing}
    </View>
  );
}

export function LabelValue({
  label,
  value,
  last = false,
}: {
  label: string;
  value: ReactNode;
  last?: boolean;
}) {
  return (
    <View style={[styles.labelValue, last && styles.noBorder]}>
      <Text style={styles.label}>{label}</Text>
      {typeof value === "string" ? (
        <Text style={styles.value}>{value}</Text>
      ) : (
        value
      )}
    </View>
  );
}

export function MetricCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "success" | "warning";
}) {
  return (
    <Card style={styles.metricCard}>
      <Text
        style={[
          styles.metricValue,
          tone === "success" && styles.successText,
          tone === "warning" && styles.warningText,
        ]}
      >
        {value}
      </Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </Card>
  );
}

export function ListRow({
  title,
  subtitle,
  meta,
  icon = "chevron-forward",
  onPress,
  accessibilityLabel,
}: {
  title: string;
  subtitle?: string;
  meta?: ReactNode;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const content = (
    <>
      <View style={styles.listContent}>
        <Text style={styles.listTitle}>{title}</Text>
        {subtitle ? <Text style={styles.listSubtitle}>{subtitle}</Text> : null}
      </View>
      {meta}
      {onPress ? (
        <Ionicons name={icon} size={18} color={colors.textMuted} />
      ) : null}
    </>
  );

  if (!onPress) return <View style={styles.listRow}>{content}</View>;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      onPress={onPress}
      style={({ pressed }) => [
        styles.listRow,
        pressed && styles.listRowPressed,
      ]}
    >
      {content}
    </Pressable>
  );
}

export function StatusPill({ status }: { status: InvoiceStatus | "overdue" }) {
  const tone =
    status === "paid"
      ? colors.success
      : status === "overdue"
        ? colors.danger
        : status === "sent"
          ? colors.info
          : colors.textMuted;

  return (
    <View style={[styles.pill, { borderColor: tone }]}>
      <Text style={[styles.pillText, { color: tone }]}>{status}</Text>
    </View>
  );
}

export function PrimaryButton({
  label,
  onPress,
  loading = false,
  disabled = false,
  variant = "primary",
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger";
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === "secondary" && styles.buttonSecondary,
        variant === "danger" && styles.buttonDanger,
        pressed && styles.buttonPressed,
        (disabled || loading) && styles.buttonDisabled,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.white} />
      ) : (
        <Text style={styles.buttonText}>{label}</Text>
      )}
    </Pressable>
  );
}

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <View style={styles.state}>
      <ActivityIndicator color={colors.accent} size="large" />
      <Text style={styles.stateText}>{label}</Text>
    </View>
  );
}

export function MessageState({
  title,
  message,
  icon = "file-tray-outline",
  actionLabel,
  onAction,
}: {
  title: string;
  message: string;
  icon?: keyof typeof Ionicons.glyphMap;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <Card style={styles.state}>
      <Ionicons name={icon} size={30} color={colors.textMuted} />
      <Text style={styles.stateTitle}>{title}</Text>
      <Text style={styles.stateText}>{message}</Text>
      {actionLabel && onAction ? (
        <PrimaryButton
          label={actionLabel}
          onPress={onAction}
          variant="secondary"
        />
      ) : null}
    </Card>
  );
}

export function QueryBoundary({
  loading,
  error,
  hasData,
  retry,
  children,
}: PropsWithChildren<{
  loading: boolean;
  error: string | null;
  hasData: boolean;
  retry: () => void;
}>) {
  if (loading && !hasData) return <LoadingState />;
  if (error && !hasData) {
    return (
      <MessageState
        title="Unable to load"
        message={error}
        icon="alert-circle-outline"
        actionLabel="Try again"
        onAction={retry}
      />
    );
  }
  return children;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  screenContent: {
    padding: spacing.lg,
    paddingBottom: 120,
    gap: spacing.lg,
  },
  heading: {
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  title: {
    color: colors.text,
    fontSize: 30,
    fontWeight: "700",
    letterSpacing: -0.6,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 21,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "600",
  },
  labelValue: {
    alignItems: "flex-start",
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: spacing.lg,
    justifyContent: "space-between",
    paddingVertical: spacing.md,
  },
  noBorder: {
    borderBottomWidth: 0,
  },
  label: {
    color: colors.textMuted,
    flex: 1,
    fontSize: 14,
  },
  value: {
    color: colors.text,
    flex: 2,
    fontSize: 14,
    textAlign: "right",
  },
  metricCard: {
    flex: 1,
    minWidth: "46%",
  },
  metricValue: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "700",
  },
  metricLabel: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: spacing.xs,
  },
  successText: {
    color: colors.success,
  },
  warningText: {
    color: colors.warning,
  },
  listRow: {
    alignItems: "center",
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: spacing.md,
    minHeight: 64,
    paddingVertical: spacing.md,
  },
  listRowPressed: {
    opacity: 0.65,
  },
  listContent: {
    flex: 1,
    gap: 3,
  },
  listTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "600",
  },
  listSubtitle: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  pill: {
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  pillText: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  button: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: radius.sm,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: spacing.lg,
  },
  buttonSecondary: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderWidth: 1,
  },
  buttonDanger: {
    backgroundColor: colors.danger,
  },
  buttonPressed: {
    opacity: 0.75,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  buttonText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: "700",
  },
  state: {
    alignItems: "center",
    gap: spacing.md,
    justifyContent: "center",
    minHeight: 180,
    padding: spacing.xl,
  },
  stateTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "600",
    textAlign: "center",
  },
  stateText: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
});
