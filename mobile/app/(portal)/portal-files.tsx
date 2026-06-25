import { useState } from "react";
import { Alert, Linking } from "react-native";

import {
  Card,
  ListRow,
  MessageState,
  QueryBoundary,
  Screen,
  SectionTitle,
} from "@/src/components/ui";
import {
  createFileDownloadUrl,
  getClientFiles,
} from "@/src/lib/data";
import { UploadDocumentButton } from "@/src/components/upload-document";
import { formatDateTime, formatFileSize } from "@/src/lib/format";
import { useScreenQuery } from "@/src/hooks/use-screen-query";
import { useRealtimeRefresh } from "@/src/hooks/use-realtime-refresh";
import { useAuth } from "@/src/providers/auth-provider";
import type { FileCategory } from "@/src/types/database";

const categoryLabels: Record<FileCategory, string> = {
  uploads: "Uploads",
  final_files: "Final files",
  invoices: "Invoice files",
};

export default function PortalFilesScreen() {
  const { portalAccess } = useAuth();
  const [openingId, setOpeningId] = useState<string | null>(null);
  const query = useScreenQuery(() => {
    if (!portalAccess) throw new Error("Portal access is unavailable.");
    return getClientFiles(portalAccess.clientId);
  });

  useRealtimeRefresh(
    "portal-files",
    portalAccess
      ? [
          {
            table: "client_files",
            filter: `client_id=eq.${portalAccess.clientId}`,
          },
        ]
      : [],
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
      title="Files"
      subtitle="Files shared securely through your TD Studios portal."
      refreshing={query.refreshing}
      onRefresh={() => void query.refresh()}
    >
      {portalAccess?.canUpload ? (
        <Card>
          <SectionTitle>Add a file</SectionTitle>
          <UploadDocumentButton
            clientId={portalAccess.clientId}
            label="Upload Document"
            onUploaded={() => void query.retry()}
          />
        </Card>
      ) : null}

      <QueryBoundary
        loading={query.loading}
        error={query.error}
        hasData={Boolean(query.data)}
        retry={() => void query.retry()}
      >
        {query.data?.length ? (
          (Object.keys(categoryLabels) as FileCategory[]).map((category) => {
            const files = query.data?.filter(
              (file) => file.category === category,
            );
            if (!files?.length) return null;
            return (
              <Card key={category}>
                <SectionTitle>{categoryLabels[category]}</SectionTitle>
                {files.map((file) => (
                  <ListRow
                    key={file.id}
                    title={openingId === file.id ? "Opening…" : file.name}
                    subtitle={`${formatFileSize(file.size_bytes)} · ${formatDateTime(file.created_at)}`}
                    icon="open-outline"
                    onPress={() => void openFile(file.id, file.storage_path)}
                  />
                ))}
              </Card>
            );
          })
        ) : (
          <MessageState
            title="No files yet"
            message="Files shared by TD Studios will appear here."
            icon="folder-open-outline"
          />
        )}
      </QueryBoundary>
    </Screen>
  );
}
