import { useLocalSearchParams, useRouter } from "expo-router";

import { InvoiceDetail } from "@/src/components/invoice-detail";
import {
  MessageState,
  PrimaryButton,
  QueryBoundary,
  Screen,
} from "@/src/components/ui";
import { getInvoice } from "@/src/lib/data";
import { useScreenQuery } from "@/src/hooks/use-screen-query";

export default function InvoiceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const query = useScreenQuery(() => getInvoice(id));

  return (
    <Screen
      title={query.data?.invoice_number ?? "Invoice"}
      subtitle="Read-only invoice detail."
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
            <PrimaryButton
              label="Edit invoice"
              variant="secondary"
              onPress={() =>
                router.push({
                  pathname: "/invoices/edit",
                  params: { id },
                })
              }
            />
            <InvoiceDetail invoice={query.data} />
          </>
        ) : (
          <MessageState
            title="Invoice not found"
            message="The invoice may have been removed or is no longer available."
          />
        )}
      </QueryBoundary>
    </Screen>
  );
}
