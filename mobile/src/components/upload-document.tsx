import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { PrimaryButton } from "@/src/components/ui";
import { formatFileSize } from "@/src/lib/format";
import {
  ALLOWED_TYPES_LABEL,
  FILE_CATEGORIES,
  FILE_CATEGORY_LABELS,
  type FileUploadHandle,
  type PickedFile,
  UploadCancelledError,
  pickDocument,
  pickFromCamera,
  pickFromLibrary,
  startFileUpload,
  validatePickedFile,
} from "@/src/lib/uploads";
import { colors, radius, spacing } from "@/src/theme";
import type {
  ClientFileFolder,
  FileCategory,
} from "@/src/types/database";

type Phase = "choose" | "preview" | "uploading" | "success" | "error";

function splitName(name: string): { base: string; ext: string } {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return { base: name, ext: "" };
  return { base: name.slice(0, dot), ext: name.slice(dot + 1) };
}

/**
 * Shared document upload flow. Renders a trigger button that opens a modal:
 * pick a source (camera / library / files) → preview + rename → upload with
 * progress + cancel → success, with retry on failure. Uploads go straight to
 * the existing `client-files` bucket via RLS (see src/lib/uploads.ts).
 */
export function UploadDocumentButton({
  clientId,
  label = "Upload Document",
  variant = "primary",
  invoiceNumber,
  categories = ["uploads"],
  defaultCategory = categories[0] ?? "uploads",
  folders = [],
  destinationLabel,
  onUploaded,
}: {
  clientId: string;
  label?: string;
  variant?: "primary" | "secondary";
  invoiceNumber?: string;
  categories?: FileCategory[];
  defaultCategory?: FileCategory;
  folders?: ClientFileFolder[];
  destinationLabel?: string;
  onUploaded?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("choose");
  const [file, setFile] = useState<PickedFile | null>(null);
  const [baseName, setBaseName] = useState("");
  const [ext, setExt] = useState("");
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [handle, setHandle] = useState<FileUploadHandle | null>(null);
  const [category, setCategory] = useState<FileCategory>(defaultCategory);
  const [folderId, setFolderId] = useState<string | null>(null);

  const availableCategories =
    categories.length > 0 ? categories : FILE_CATEGORIES;
  const availableFolders = folders.filter(
    (folder) => folder.category === category,
  );

  function reset() {
    setPhase("choose");
    setFile(null);
    setBaseName("");
    setExt("");
    setProgress(0);
    setErrorMsg(null);
    setHandle(null);
    setCategory(defaultCategory);
    setFolderId(null);
  }

  function close() {
    handle?.cancel();
    setOpen(false);
    reset();
  }

  async function pick(source: "camera" | "library" | "files") {
    try {
      const picked =
        source === "camera"
          ? await pickFromCamera()
          : source === "library"
            ? await pickFromLibrary()
            : await pickDocument();
      if (!picked) return; // user cancelled the OS picker

      const problem = validatePickedFile(picked);
      if (problem) {
        Alert.alert("Can't use this file", problem);
        return;
      }
      const parts = splitName(picked.name);
      setFile(picked);
      setBaseName(parts.base);
      setExt(parts.ext);
      setErrorMsg(null);
      setPhase("preview");
    } catch (error) {
      Alert.alert(
        "Couldn't open that source",
        error instanceof Error ? error.message : "Please try again.",
      );
    }
  }

  function displayName(): string {
    const base = baseName.trim() || "file";
    return ext ? `${base}.${ext}` : base;
  }

  function upload() {
    if (!file) return;
    setErrorMsg(null);
    setProgress(0);
    setPhase("uploading");
    const h = startFileUpload(
      {
        clientId,
        file,
        displayName: displayName(),
        category,
        folderId,
        invoiceNumber,
      },
      (ratio) => setProgress(ratio),
    );
    setHandle(h);
    h.promise.then(
      () => {
        setPhase("success");
        onUploaded?.();
      },
      (error) => {
        if (error instanceof UploadCancelledError) {
          setPhase("preview");
          return;
        }
        setErrorMsg(
          error instanceof Error
            ? error.message
            : "Upload failed. Check your connection and try again.",
        );
        setPhase("error");
      },
    );
  }

  return (
    <>
      <PrimaryButton label={label} variant={variant} onPress={() => setOpen(true)} />
      <Modal visible={open} animationType="slide" onRequestClose={close}>
        <SafeAreaView style={styles.modal} edges={["top", "bottom"]}>
          <View style={styles.header}>
            <Pressable
              onPress={close}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Close upload"
            >
              <Ionicons name="close" size={26} color={colors.text} />
            </Pressable>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {invoiceNumber ? `Upload to ${invoiceNumber}` : "Upload Document"}
            </Text>
            <View style={styles.headerSpacer} />
          </View>

          <ScrollView
            contentContainerStyle={styles.body}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
          >
            {phase === "choose" ? (
              <View style={styles.choices}>
                <Text style={styles.help}>
                  Add a document or photo. Allowed: {ALLOWED_TYPES_LABEL}, up to
                  25 MB.
                </Text>
                <SourceButton
                  icon="camera-outline"
                  label="Take Photo"
                  onPress={() => void pick("camera")}
                />
                <SourceButton
                  icon="images-outline"
                  label="Choose from Library"
                  onPress={() => void pick("library")}
                />
                <SourceButton
                  icon="document-outline"
                  label="Choose a File"
                  onPress={() => void pick("files")}
                />
              </View>
            ) : null}

            {phase === "preview" && file ? (
              <View style={styles.previewWrap}>
                {file.isImage ? (
                  <Image source={{ uri: file.uri }} style={styles.thumb} />
                ) : (
                  <View style={styles.fileIcon}>
                    <Ionicons
                      name="document-text-outline"
                      size={48}
                      color={colors.accent}
                    />
                  </View>
                )}
                <Text style={styles.sizeText}>{formatFileSize(file.size)}</Text>

                <Text style={styles.fieldLabel}>File name</Text>
                <View style={styles.nameRow}>
                  <TextInput
                    accessibilityLabel="File name"
                    value={baseName}
                    onChangeText={setBaseName}
                    placeholder="File name"
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={styles.input}
                  />
                  {ext ? <Text style={styles.ext}>.{ext}</Text> : null}
                </View>

                {availableCategories.length > 1 ? (
                  <View style={styles.optionGroup}>
                    <Text style={styles.fieldLabel}>Category</Text>
                    <View style={styles.optionRow}>
                      {availableCategories.map((option) => (
                        <OptionChip
                          key={option}
                          label={FILE_CATEGORY_LABELS[option]}
                          selected={category === option}
                          onPress={() => {
                            setCategory(option);
                            setFolderId(null);
                          }}
                        />
                      ))}
                    </View>
                  </View>
                ) : null}

                {availableFolders.length > 0 ? (
                  <View style={styles.optionGroup}>
                    <Text style={styles.fieldLabel}>Folder</Text>
                    <View style={styles.optionRow}>
                      <OptionChip
                        label="No folder"
                        selected={!folderId}
                        onPress={() => setFolderId(null)}
                      />
                      {availableFolders.map((folder) => (
                        <OptionChip
                          key={folder.id}
                          label={folder.name}
                          selected={folderId === folder.id}
                          onPress={() => setFolderId(folder.id)}
                        />
                      ))}
                    </View>
                  </View>
                ) : null}

                <PrimaryButton label="Upload" onPress={upload} />
                <Pressable onPress={reset} style={styles.linkBtn}>
                  <Text style={styles.linkText}>Choose a different file</Text>
                </Pressable>
              </View>
            ) : null}

            {phase === "uploading" ? (
              <View style={styles.center}>
                <Text style={styles.uploadingName} numberOfLines={1}>
                  {displayName()}
                </Text>
                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFill,
                      { width: `${Math.round(progress * 100)}%` },
                    ]}
                  />
                </View>
                <Text style={styles.percent}>
                  {Math.round(progress * 100)}%
                </Text>
                <ActivityIndicator color={colors.accent} style={styles.spinner} />
                <PrimaryButton
                  label="Cancel"
                  variant="secondary"
                  onPress={() => handle?.cancel()}
                />
              </View>
            ) : null}

            {phase === "success" ? (
              <View style={styles.center}>
                <Ionicons
                  name="checkmark-circle"
                  size={64}
                  color={colors.success}
                />
                <Text style={styles.successTitle}>Uploaded</Text>
                <Text style={styles.help}>
                  {displayName()} was uploaded
                  {destinationLabel ? ` for ${destinationLabel}` : ""}.
                </Text>
                <PrimaryButton label="Done" onPress={close} />
                <Pressable onPress={reset} style={styles.linkBtn}>
                  <Text style={styles.linkText}>Upload another</Text>
                </Pressable>
              </View>
            ) : null}

            {phase === "error" ? (
              <View style={styles.center}>
                <Ionicons name="alert-circle" size={64} color={colors.danger} />
                <Text style={styles.errorTitle}>Upload failed</Text>
                <Text style={styles.help}>{errorMsg}</Text>
                <PrimaryButton label="Retry" onPress={upload} />
                <Pressable onPress={reset} style={styles.linkBtn}>
                  <Text style={styles.linkText}>Start over</Text>
                </Pressable>
              </View>
            ) : null}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </>
  );
}

function OptionChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.optionChip,
        selected && styles.optionChipSelected,
        pressed && styles.sourcePressed,
      ]}
    >
      <Text
        style={[
          styles.optionChipText,
          selected && styles.optionChipTextSelected,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function SourceButton({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.source, pressed && styles.sourcePressed]}
    >
      <Ionicons name={icon} size={22} color={colors.accent} />
      <Text style={styles.sourceLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  modal: { flex: 1, backgroundColor: colors.background },
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
  headerSpacer: { width: 26 },
  body: { flexGrow: 1, padding: spacing.lg },
  help: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: spacing.md,
    textAlign: "center",
  },
  choices: { gap: spacing.md },
  source: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  sourcePressed: { backgroundColor: colors.surfaceRaised },
  sourceLabel: { color: colors.text, flex: 1, fontSize: 16, fontWeight: "500" },
  previewWrap: { alignItems: "center", gap: spacing.sm },
  thumb: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    height: 200,
    width: "100%",
  },
  fileIcon: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    height: 160,
    justifyContent: "center",
    width: "100%",
  },
  sizeText: { color: colors.textMuted, fontSize: 13 },
  fieldLabel: {
    alignSelf: "flex-start",
    color: colors.textMuted,
    fontSize: 12,
    marginTop: spacing.sm,
    textTransform: "uppercase",
  },
  optionGroup: {
    alignSelf: "stretch",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  optionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  optionChip: {
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  optionChipSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  optionChipText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "600",
  },
  optionChipTextSelected: {
    color: colors.white,
  },
  nameRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs,
    marginBottom: spacing.md,
    width: "100%",
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    color: colors.text,
    flex: 1,
    fontSize: 16,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  ext: { color: colors.textMuted, fontSize: 16 },
  center: { alignItems: "center", flex: 1, gap: spacing.sm, justifyContent: "center" },
  uploadingName: { color: colors.text, fontSize: 15, fontWeight: "500" },
  progressTrack: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.pill,
    height: 8,
    marginTop: spacing.sm,
    overflow: "hidden",
    width: "100%",
  },
  progressFill: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    height: 8,
  },
  percent: { color: colors.textMuted, fontSize: 13 },
  spinner: { marginVertical: spacing.sm },
  successTitle: { color: colors.text, fontSize: 20, fontWeight: "700" },
  errorTitle: { color: colors.text, fontSize: 20, fontWeight: "700" },
  linkBtn: { paddingVertical: spacing.sm },
  linkText: { color: colors.accent, fontSize: 15, fontWeight: "500" },
});
