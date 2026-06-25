import { useLocalSearchParams, useRouter } from "expo-router";

import { InvoiceForm } from "@/src/components/invoice-form";
import {
  MessageState,
  QueryBoundary,
  Screen,
} from "@/src/components/ui";
import { getClients, getCompanySettings } from "@/src/lib/data";
import {
  createInvoice,
  type InvoiceWriteInput,
} from "@/src/lib/invoices";
import { useScreenQuery } from "@/src/hooks/use-screen-query";

export default function NewInvoiceScreen() {
  const { clientId } = useLocalSearchParams<{ clientId?: string }>();
  const router = useRouter();
  const query = useScreenQuery(async () => {
    const [clients, settings] = await Promise.all([
      getClients(),
      getCompanySettings(),
    ]);
    return { clients, settings };
  });

  async function save(input: InvoiceWriteInput) {
    const id = await createInvoice(input);
    router.replace({
      pathname: "/invoices/[id]",
      params: { id },
    });
  }

  return (
    <Screen
      title="New invoice"
      subtitle="The invoice number is assigned automatically when saved."
    >
      <QueryBoundary
        loading={query.loading}
        error={query.error}
        hasData={Boolean(query.data)}
        retry={() => void query.retry()}
      >
        {query.data?.clients.length ? (
          <InvoiceForm
            clients={query.data.clients}
            defaultClientId={
              query.data.clients.some((client) => client.id === clientId)
                ? clientId
                : ""
            }
            defaultTaxRate={query.data.settings?.tax_rate ?? 0}
            submitLabel="Create invoice"
            onSubmit={save}
            onCancel={() => router.back()}
          />
        ) : (
          <MessageState
            title="No clients available"
            message="Create a client in the web app before creating a mobile invoice."
            icon="people-outline"
          />
        )}
      </QueryBoundary>
    </Screen>
  );
}
