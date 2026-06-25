import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import {
  Card,
  ListRow,
  MessageState,
  QueryBoundary,
  Screen,
  StatusPill,
} from "@/src/components/ui";
import { getInvoicesForClient } from "@/src/lib/data";
import {
  effectiveStatus,
  formatCurrency,
  formatDate,
} from "@/src/lib/format";
import { useScreenQuery } from "@/src/hooks/use-screen-query";
import { useRealtimeRefresh } from "@/src/hooks/use-realtime-refresh";
import { useAuth } from "@/src/providers/auth-provider";
import { colors, spacing } from "@/src/theme";

export default function PortalInvoicesScreen() {
  const router = useRouter();
  const { portalAccess } = useAuth();
  const query = useScreenQuery(async () => {
    if (!portalAccess) throw new Error("Portal access is unavailable.");
    const invoices = await getInvoicesForClient(portalAccess.clientId);
    return invoices.filter((invoice) => invoice.status !== "draft");
  });

  useRealtimeRefresh(
    "portal-invoices",
    portalAccess
      ? [{ table: "invoices", filter: `client_id=eq.${portalAccess.clientId}` }]
      : [],
    () => void query.retry(),
  );

  return (
    <Screen
      title="Invoices"
      subtitle="Review invoices issued to your company."
      refreshing={query.refreshing}
      onRefresh={() => void query.refresh()}
    >
      <QueryBoundary
        loading={query.loading}
        error={query.error}
        hasData={Boolean(query.data)}
        retry={() => void query.retry()}
      >
        {query.data?.length ? (
          <Card>
            {query.data.map((invoice) => (
              <ListRow
                key={invoice.id}
                title={invoice.invoice_number}
                subtitle={`Issued ${formatDate(invoice.issue_date)}`}
                meta={
                  <View style={styles.meta}>
                    <Text style={styles.amount}>
                      {formatCurrency(invoice.total)}
                    </Text>
                    <StatusPill status={effectiveStatus(invoice)} />
                  </View>
                }
                onPress={() =>
                  router.push({
                    pathname: "/portal-invoices/[id]",
                    params: { id: invoice.id },
                  })
                }
              />
            ))}
          </Card>
        ) : (
          <MessageState
            title="No invoices yet"
            message="Invoices from TD Studios will appear here."
          />
        )}
      </QueryBoundary>
    </Screen>
  );
}

const styles = StyleSheet.create({
  meta: {
    alignItems: "flex-end",
    gap: spacing.xs,
  },
  amount: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "600",
  },
});
