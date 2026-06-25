import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import {
  Card,
  ListRow,
  MessageState,
  MetricCard,
  QueryBoundary,
  Screen,
  SectionTitle,
  StatusPill,
} from "@/src/components/ui";
import { getClients, getInvoices } from "@/src/lib/data";
import { effectiveStatus, formatCurrency } from "@/src/lib/format";
import { useScreenQuery } from "@/src/hooks/use-screen-query";
import { useRealtimeRefresh } from "@/src/hooks/use-realtime-refresh";
import { colors, spacing } from "@/src/theme";

export default function DashboardScreen() {
  const router = useRouter();
  const query = useScreenQuery(async () => {
    const [invoices, clients] = await Promise.all([getInvoices(), getClients()]);
    const sentInvoices = invoices.filter((invoice) => invoice.status !== "draft");
    const paid = sentInvoices
      .filter((invoice) => invoice.status === "paid")
      .reduce((sum, invoice) => sum + Number(invoice.total), 0);
    const outstanding = sentInvoices
      .filter((invoice) => invoice.status !== "paid")
      .reduce((sum, invoice) => sum + Number(invoice.total), 0);
    const overdue = sentInvoices.filter(
      (invoice) => effectiveStatus(invoice) === "overdue",
    );

    return {
      clients,
      invoices,
      recent: invoices.slice(0, 5),
      paid,
      outstanding,
      overdue: overdue.length,
    };
  });

  useRealtimeRefresh(
    "admin-dashboard",
    [{ table: "invoices" }, { table: "clients" }, { table: "payments" }],
    () => void query.retry(),
  );

  return (
    <Screen
      title="Dashboard"
      subtitle="A read-only view of the TD Studios workspace."
      refreshing={query.refreshing}
      onRefresh={() => void query.refresh()}
    >
      <QueryBoundary
        loading={query.loading}
        error={query.error}
        hasData={Boolean(query.data)}
        retry={() => void query.retry()}
      >
        {query.data ? (
          <>
            <View style={styles.metrics}>
              <MetricCard
                label="Outstanding"
                value={formatCurrency(query.data.outstanding)}
                tone="warning"
              />
              <MetricCard
                label="Paid"
                value={formatCurrency(query.data.paid)}
                tone="success"
              />
              <MetricCard
                label="Clients"
                value={String(query.data.clients.length)}
              />
              <MetricCard
                label="Overdue"
                value={String(query.data.overdue)}
                tone={query.data.overdue ? "warning" : "default"}
              />
            </View>

            <SectionTitle>Recent invoices</SectionTitle>
            {query.data.recent.length === 0 ? (
              <MessageState
                title="No invoices yet"
                message="Invoices created in the web app will appear here."
              />
            ) : (
              <Card>
                {query.data.recent.map((invoice) => (
                  <ListRow
                    key={invoice.id}
                    title={invoice.invoice_number}
                    subtitle={invoice.client?.company_name ?? "No client"}
                    meta={
                      <View style={styles.invoiceMeta}>
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
            )}
          </>
        ) : null}
      </QueryBoundary>
    </Screen>
  );
}

const styles = StyleSheet.create({
  metrics: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  invoiceMeta: {
    alignItems: "flex-end",
    gap: spacing.xs,
  },
  amount: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "600",
  },
});
