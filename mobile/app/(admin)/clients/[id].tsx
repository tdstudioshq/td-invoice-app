import { useState } from "react";
import { Alert, Linking } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { UploadDocumentButton } from "@/src/components/upload-document";
import {
  Card,
  LabelValue,
  ListRow,
  MessageState,
  PrimaryButton,
  QueryBoundary,
  Screen,
  SectionTitle,
  StatusPill,
} from "@/src/components/ui";
import {
  createFileDownloadUrl,
  getClient,
  getClientFiles,
  getClientFolders,
  getInvoicesForClient,
} from "@/src/lib/data";
import {
  effectiveStatus,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatFileSize,
} from "@/src/lib/format";
import {
  FILE_CATEGORIES,
  FILE_CATEGORY_LABELS,
} from "@/src/lib/uploads";
import { useScreenQuery } from "@/src/hooks/use-screen-query";
import { useRealtimeRefresh } from "@/src/hooks/use-realtime-refresh";

export default function ClientDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [openingId, setOpeningId] = useState<string | null>(null);
  const query = useScreenQuery(async () => {
    const [client, invoices, files, folders] = await Promise.all([
      getClient(id),
      getInvoicesForClient(id),
      getClientFiles(id),
      getClientFolders(id),
    ]);
    return { client, invoices, files, folders };
  });

  useRealtimeRefresh(
    `admin-client-files-${id}`,
    [{ table: "client_files", filter: `client_id=eq.${id}` }],
    () => void query.retry(),
  );

  async function openFile(fileId: string, storagePath: string) {
    setOpeningId(fileId);
    try {
      const url = await createFileDownloadUrl(storagePath);
      await Linking.openURL(url);
    } catch (error) {
      Alert.alert(
        "Unable to open file",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setOpeningId(null);
    }
  }

  return (
    <Screen
      title={query.data?.client?.company_name ?? "Client"}
      subtitle="Contact details and invoice history."
      refreshing={query.refreshing}
      onRefresh={() => void query.refresh()}
    >
      <QueryBoundary
        loading={query.loading}
        error={query.error}
        hasData={Boolean(query.data)}
        retry={() => void query.retry()}
      >
        {query.data?.client ? (
          <>
            <Card>
              <LabelValue
                label="Contact"
                value={query.data.client.contact_name ?? "—"}
              />
              <LabelValue
                label="Email"
                value={query.data.client.email ?? "—"}
              />
              <LabelValue
                label="Phone"
                value={query.data.client.phone ?? "—"}
              />
              <LabelValue
                label="Address"
                value={query.data.client.address ?? "—"}
                last={!query.data.client.notes}
              />
              {query.data.client.notes ? (
                <LabelValue
                  label="Notes"
                  value={query.data.client.notes}
                  last
                />
              ) : null}
            </Card>

            <PrimaryButton
              label="Create invoice"
              onPress={() =>
                router.push({
                  pathname: "/invoices/new",
                  params: { clientId: id },
                })
              }
            />

            <SectionTitle>Files</SectionTitle>
            <Card>
              <SectionTitle>Add a file</SectionTitle>
              <UploadDocumentButton
                clientId={id}
                label="Upload file"
                categories={FILE_CATEGORIES}
                defaultCategory="final_files"
                folders={query.data.folders}
                destinationLabel={query.data.client.company_name}
                onUploaded={() => void query.retry()}
              />
            </Card>

            {query.data.files.length ? (
              FILE_CATEGORIES.map((category) => {
                const files = (query.data?.files ?? []).filter(
                  (file) => file.category === category,
                );
                if (!files.length) return null;
                return (
                  <Card key={category}>
                    <SectionTitle>
                      {FILE_CATEGORY_LABELS[category]}
                    </SectionTitle>
                    {files.map((file) => (
                      <ListRow
                        key={file.id}
                        title={openingId === file.id ? "Opening…" : file.name}
                        subtitle={`${formatFileSize(file.size_bytes)} · ${formatDateTime(file.created_at)}`}
                        icon="open-outline"
                        onPress={() =>
                          void openFile(file.id, file.storage_path)
                        }
                      />
                    ))}
                  </Card>
                );
              })
            ) : (
              <MessageState
                title="No files"
                message="Upload a deliverable, invoice file, or client document."
                icon="folder-open-outline"
              />
            )}

            <SectionTitle>Invoices</SectionTitle>
            {query.data.invoices.length ? (
              <Card>
                {query.data.invoices.map((invoice) => (
                  <ListRow
                    key={invoice.id}
                    title={invoice.invoice_number}
                    subtitle={`${formatDate(invoice.issue_date)} · ${formatCurrency(invoice.total)}`}
                    meta={<StatusPill status={effectiveStatus(invoice)} />}
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
                message="This client does not have any invoices yet."
              />
            )}
          </>
        ) : (
          <MessageState
            title="Client not found"
            message="The client may have been removed or is no longer available."
          />
        )}
      </QueryBoundary>
    </Screen>
  );
}
