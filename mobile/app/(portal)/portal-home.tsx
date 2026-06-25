import { useRouter } from "expo-router";

import {
  Card,
  ListRow,
  MessageState,
  MetricCard,
  QueryBoundary,
  Screen,
  SectionTitle,
} from "@/src/components/ui";
import {
  getClient,
  getClientFiles,
  getInvoicesForClient,
} from "@/src/lib/data";
import { effectiveStatus, formatCurrency } from "@/src/lib/format";
import { useScreenQuery } from "@/src/hooks/use-screen-query";
import { useAuth } from "@/src/providers/auth-provider";
import { StyleSheet, View } from "react-native";
import { spacing } from "@/src/theme";

export default function PortalHomeScreen() {
  const router = useRouter();
  const { portalAccess } = useAuth();
  const query = useScreenQuery(async () => {
    if (!portalAccess) throw new Error("Portal access is unavailable.");
    const [client, files, invoices] = await Promise.all([
      getClient(portalAccess.clientId),
      getClientFiles(portalAccess.clientId),
      getInvoicesForClient(portalAccess.clientId),
    ]);
    const visibleInvoices = invoices.filter(
      (invoice) => invoice.status !== "draft",
    );
    const openTotal = visibleInvoices
      .filter((invoice) => effectiveStatus(invoice) !== "paid")
      .reduce((sum, invoice) => sum + Number(invoice.total), 0);
    return { client, files, invoices: visibleInvoices, openTotal };
  });

  return (
    <Screen
      title={
        query.data?.client
          ? `Welcome, ${query.data.client.company_name}`
          : "Client portal"
      }
      subtitle="Your TD Studios files and invoices in one place."
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
                label="Files available"
                value={String(query.data.files.length)}
              />
              <MetricCard
                label="Open balance"
                value={formatCurrency(query.data.openTotal)}
                tone="warning"
              />
            </View>

            <SectionTitle>Quick access</SectionTitle>
            <Card>
              <ListRow
                title="Files"
                subtitle="View files shared with you"
                icon="folder-outline"
                onPress={() => router.push("/portal-files")}
              />
              <ListRow
                title="Invoices"
                subtitle={`${query.data.invoices.length} available`}
                icon="document-text-outline"
                onPress={() => router.push("/portal-invoices")}
              />
            </Card>
          </>
        ) : (
          <MessageState
            title="Portal unavailable"
            message="Your client portal could not be loaded."
          />
        )}
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
});
