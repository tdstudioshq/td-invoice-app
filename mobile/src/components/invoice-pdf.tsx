import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

import { PrimaryButton } from "@/src/components/ui";
import { getCompanySettings } from "@/src/lib/data";
import { buildInvoiceHtml } from "@/src/lib/invoice-html";
import { apiBaseUrl, supabase } from "@/src/lib/supabase";
import { colors, spacing } from "@/src/theme";
import type {
  CompanySettings,
  InvoiceWithRelations,
} from "@/src/types/database";

/**
 * Downloads the authoritative, pdf-lib-rendered invoice PDF from the web app's
 * existing `/api/invoices/[id]/pdf` route into the app cache, authenticated with
 * the user's Supabase access token (the route is RLS-scoped, so this only ever
 * succeeds for an invoice the signed-in admin or portal user is allowed to see).
 * Returns a local `file://` URI. Throws when the base URL or session is missing
 * or the request fails, so the caller can fall back to the HTML recreation.
 */
async function downloadInvoicePdf(
  invoice: InvoiceWithRelations,
): Promise<string> {
  if (!apiBaseUrl) throw new Error("Web app URL not configured");
  if (!FileSystem.cacheDirectory) throw new Error("No cache directory");

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("No active session");

  const url = `${apiBaseUrl}/api/invoices/${invoice.id}/pdf`;
  const dest = `${FileSystem.cacheDirectory}${invoice.invoice_number}.pdf`;
  const result = await FileSystem.downloadAsync(url, dest, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (result.status !== 200) {
    throw new Error(`PDF request failed (${result.status})`);
  }
  return result.uri;
}

/**
 * "View PDF" action + full-screen preview modal. Opens the real invoice PDF
 * served by the web app — fetched once on open and rendered natively in a
 * WebView — and shares that exact file via the system share sheet. When the web
 * app URL isn't configured (or the device is offline), it falls back to a
 * locally rendered HTML recreation of the invoice via expo-print, so the feature
 * still works in a degraded form.
 */
export function InvoicePdfButton({
  invoice,
}: {
  invoice: InvoiceWithRelations;
}) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pdfUri, setPdfUri] = useState<string | null>(null);
  const [usedFallback, setUsedFallback] = useState(false);
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [sharing, setSharing] = useState(false);

  async function handleOpen() {
    setOpen(true);
    if (loaded) return;
    setLoading(true);
    try {
      // Primary path: the authoritative PDF from the web app's PDF route.
      const uri = await downloadInvoicePdf(invoice);
      setPdfUri(uri);
      setUsedFallback(false);
    } catch {
      // Fallback: render the invoice from data the app already has. Company
      // settings power the header; absence is non-fatal (defaults are used).
      try {
        setSettings(await getCompanySettings());
      } catch {
        // Keep the null default.
      }
      setUsedFallback(true);
    } finally {
      setLoaded(true);
      setLoading(false);
    }
  }

  async function handleShare() {
    setSharing(true);
    try {
      // Share the downloaded PDF as-is; only re-render from HTML in fallback mode.
      let uri = pdfUri;
      if (usedFallback || !uri) {
        const printed = await Print.printToFileAsync({
          html: buildInvoiceHtml(invoice, settings),
        });
        uri = printed.uri;
      }
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: "application/pdf",
          dialogTitle: `${invoice.invoice_number}.pdf`,
          UTI: "com.adobe.pdf",
        });
      } else {
        Alert.alert(
          "Sharing unavailable",
          "The PDF was generated but cannot be shared on this device.",
        );
      }
    } catch (error) {
      Alert.alert(
        "Unable to share PDF",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setSharing(false);
    }
  }

  const previewSource =
    pdfUri && !usedFallback
      ? { uri: pdfUri }
      : { html: buildInvoiceHtml(invoice, settings) };

  return (
    <>
      <PrimaryButton
        label="View PDF"
        variant="secondary"
        onPress={() => void handleOpen()}
      />
      <Modal
        visible={open}
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        <SafeAreaView style={styles.modal} edges={["top", "bottom"]}>
          <View style={styles.header}>
            <Pressable
              onPress={() => setOpen(false)}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Close PDF preview"
            >
              <Ionicons name="close" size={26} color={colors.text} />
            </Pressable>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {invoice.invoice_number}
            </Text>
            <View style={styles.headerSpacer} />
          </View>

          {loading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.accent} size="large" />
            </View>
          ) : (
            <WebView
              originWhitelist={["*"]}
              allowFileAccess
              allowFileAccessFromFileURLs
              allowUniversalAccessFromFileURLs
              source={previewSource}
              style={styles.webview}
            />
          )}

          {usedFallback && !loading ? (
            <Text style={styles.fallbackNote}>
              Showing an offline preview — connect to download the final PDF.
            </Text>
          ) : null}

          <View style={styles.footer}>
            <PrimaryButton
              label={sharing ? "Preparing…" : "Share PDF"}
              loading={sharing}
              onPress={() => void handleShare()}
            />
          </View>
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  modal: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  headerTitle: {
    color: colors.text,
    flex: 1,
    fontSize: 17,
    fontWeight: "600",
    textAlign: "center",
  },
  headerSpacer: {
    width: 26,
  },
  loading: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
  webview: {
    flex: 1,
    backgroundColor: colors.white,
  },
  fallbackNote: {
    color: colors.textMuted,
    fontSize: 12,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    textAlign: "center",
  },
  footer: {
    padding: spacing.lg,
  },
});
