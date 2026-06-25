import { useLocalSearchParams, useRouter } from "expo-router";

import { InvoiceForm } from "@/src/components/invoice-form";
import {
  MessageState,
  QueryBoundary,
  Screen,
} from "@/src/components/ui";
import { getClients, getInvoice } from "@/src/lib/data";
import {
  type InvoiceWriteInput,
  updateInvoice,
} from "@/src/lib/invoices";
import { useScreenQuery } from "@/src/hooks/use-screen-query";

export default function EditInvoiceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const query = useScreenQuery(async () => {
    const [clients, invoice] = await Promise.all([
      getClients(),
      getInvoice(id),
    ]);
    return { clients, invoice };
  });

  async function save(input: InvoiceWriteInput) {
    if (!query.data?.invoice) throw new Error("Invoice not found.");
    await updateInvoice(query.data.invoice, input);
    router.replace({
      pathname: "/invoices/[id]",
      params: { id: query.data.invoice.id },
    });
  }

  return (
    <Screen
      title={query.data?.invoice?.invoice_number ?? "Edit invoice"}
      subtitle="Update details, line items, totals, or status."
    >
      <QueryBoundary
        loading={query.loading}
        error={query.error}
        hasData={Boolean(query.data)}
        retry={() => void query.retry()}
      >
        {query.data?.invoice ? (
          <InvoiceForm
            clients={query.data.clients}
            invoice={query.data.invoice}
            submitLabel="Save changes"
            onSubmit={save}
            onCancel={() => router.back()}
          />
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
