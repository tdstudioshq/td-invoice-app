import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import {
  Card,
  ListRow,
  MessageState,
  PrimaryButton,
  QueryBoundary,
  Screen,
  StatusPill,
} from "@/src/components/ui";
import { getInvoices } from "@/src/lib/data";
import {
  effectiveStatus,
  formatCurrency,
  formatDate,
} from "@/src/lib/format";
import { useScreenQuery } from "@/src/hooks/use-screen-query";
import { useRealtimeRefresh } from "@/src/hooks/use-realtime-refresh";
import { colors, spacing } from "@/src/theme";

export default function InvoicesScreen() {
  const router = useRouter();
  const query = useScreenQuery(getInvoices);

  useRealtimeRefresh("admin-invoices", [{ table: "invoices" }], () =>
    void query.retry(),
  );

  return (
    <Screen
      title="Invoices"
      subtitle="All invoices, newest first."
      refreshing={query.refreshing}
      onRefresh={() => void query.refresh()}
    >
      <PrimaryButton
        label="New invoice"
        onPress={() => router.push("/invoices/new")}
      />
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
                subtitle={`${invoice.client?.company_name ?? "No client"} · ${formatDate(invoice.issue_date)}`}
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
                    pathname: "/invoices/[id]",
                    params: { id: invoice.id },
                  })
                }
              />
            ))}
          </Card>
        ) : (
          <MessageState
            title="No invoices"
            message="Create the first invoice from this app."
            actionLabel="New invoice"
            onAction={() => router.push("/invoices/new")}
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
