import { useLocalSearchParams } from "expo-router";

import { InvoiceDetail } from "@/src/components/invoice-detail";
import {
  Card,
  MessageState,
  QueryBoundary,
  Screen,
  SectionTitle,
} from "@/src/components/ui";
import { UploadDocumentButton } from "@/src/components/upload-document";
import { getInvoice } from "@/src/lib/data";
import { useScreenQuery } from "@/src/hooks/use-screen-query";
import { useAuth } from "@/src/providers/auth-provider";

export default function PortalInvoiceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { portalAccess } = useAuth();
  const query = useScreenQuery(() => getInvoice(id));

  return (
    <Screen
      title={query.data?.invoice_number ?? "Invoice"}
      subtitle="Invoice detail from TD Studios."
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
            <InvoiceDetail invoice={query.data} />
            {portalAccess?.canUpload ? (
              <Card>
                <SectionTitle>Supporting documents</SectionTitle>
                <UploadDocumentButton
                  clientId={portalAccess.clientId}
                  label="Upload Supporting Document"
                  variant="secondary"
                  invoiceNumber={query.data.invoice_number}
                />
              </Card>
            ) : null}
          </>
        ) : (
          <MessageState
            title="Invoice not found"
            message="This invoice is unavailable or no longer shared with you."
          />
        )}
      </QueryBoundary>
    </Screen>
  );
}
