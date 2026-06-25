import { useMemo, useState, type ReactNode } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  Card,
  PrimaryButton,
  SectionTitle,
} from "@/src/components/ui";
import { formatCurrency, todayISO } from "@/src/lib/format";
import {
  calculateInvoiceTotals,
  INVOICE_STATUSES,
  INVOICE_STATUS_LABELS,
  type InvoiceFieldErrors,
  type InvoiceLineInput,
  type InvoiceWriteInput,
  validateInvoiceInput,
} from "@/src/lib/invoices";
import { colors, radius, spacing } from "@/src/theme";
import type {
  Client,
  InvoiceStatus,
  InvoiceWithRelations,
} from "@/src/types/database";

interface LineRow {
  key: string;
  description: string;
  quantity: string;
  unitPrice: string;
}

let rowCounter = 0;

function newRow(partial?: Partial<LineRow>): LineRow {
  rowCounter += 1;
  return {
    key: `invoice-row-${rowCounter}`,
    description: partial?.description ?? "",
    quantity: partial?.quantity ?? "1",
    unitPrice: partial?.unitPrice ?? "0",
  };
}

function initialRows(invoice?: InvoiceWithRelations | null) {
  if (!invoice?.invoice_items.length) return [newRow()];
  return invoice.invoice_items
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((item) =>
      newRow({
        description: item.description,
        quantity: String(item.quantity),
        unitPrice: String(item.unit_price),
      }),
    );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

function ClientPicker({
  clients,
  value,
  error,
  onChange,
}: {
  clients: Client[];
  value: string;
  error?: string;
  onChange: (clientId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = clients.find((client) => client.id === value);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return clients;
    return clients.filter((client) =>
      [client.company_name, client.contact_name, client.email]
        .filter(Boolean)
        .some((field) => field?.toLowerCase().includes(normalized)),
    );
  }, [clients, query]);

  function close() {
    setOpen(false);
    setQuery("");
  }

  return (
    <>
      <Field label="Client" error={error}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Select client"
          onPress={() => setOpen(true)}
          style={({ pressed }) => [
            styles.select,
            pressed && styles.pressed,
            error && styles.inputError,
          ]}
        >
          <Text style={selected ? styles.selectText : styles.placeholder}>
            {selected?.company_name ?? "Select an existing client"}
          </Text>
          <Ionicons
            name="chevron-down"
            size={18}
            color={colors.textMuted}
          />
        </Pressable>
      </Field>

      <Modal visible={open} animationType="slide" onRequestClose={close}>
        <SafeAreaView style={styles.modal} edges={["top", "bottom"]}>
          <View style={styles.modalHeader}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close client picker"
              hitSlop={12}
              onPress={close}
            >
              <Ionicons name="close" size={26} color={colors.text} />
            </Pressable>
            <Text style={styles.modalTitle}>Select client</Text>
            <View style={styles.modalSpacer} />
          </View>
          <TextInput
            accessibilityLabel="Search clients"
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Search clients"
            placeholderTextColor={colors.textMuted}
            style={[styles.input, styles.searchInput]}
            value={query}
            onChangeText={setQuery}
          />
          <FlatList
            data={filtered}
            keyExtractor={(client) => client.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.clientList}
            ListEmptyComponent={
              <Text style={styles.emptyText}>No matching clients.</Text>
            }
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  onChange(item.id);
                  close();
                }}
                style={({ pressed }) => [
                  styles.clientRow,
                  item.id === value && styles.clientRowSelected,
                  pressed && styles.pressed,
                ]}
              >
                <View style={styles.clientRowText}>
                  <Text style={styles.clientName}>{item.company_name}</Text>
                  {item.contact_name || item.email ? (
                    <Text style={styles.clientMeta}>
                      {item.contact_name ?? item.email}
                    </Text>
                  ) : null}
                </View>
                {item.id === value ? (
                  <Ionicons
                    name="checkmark-circle"
                    size={22}
                    color={colors.accent}
                  />
                ) : null}
              </Pressable>
            )}
          />
        </SafeAreaView>
      </Modal>
    </>
  );
}

function StatusPicker({
  value,
  error,
  onChange,
}: {
  value: InvoiceStatus;
  error?: string;
  onChange: (status: InvoiceStatus) => void;
}) {
  return (
    <Field label="Status" error={error}>
      <View style={styles.statusRow}>
        {INVOICE_STATUSES.map((status) => (
          <Pressable
            key={status}
            accessibilityRole="button"
            accessibilityState={{ selected: value === status }}
            onPress={() => onChange(status)}
            style={({ pressed }) => [
              styles.statusOption,
              value === status && styles.statusOptionSelected,
              pressed && styles.pressed,
            ]}
          >
            <Text
              style={[
                styles.statusText,
                value === status && styles.statusTextSelected,
              ]}
            >
              {INVOICE_STATUS_LABELS[status]}
            </Text>
          </Pressable>
        ))}
      </View>
    </Field>
  );
}

function SummaryRow({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{formatCurrency(value)}</Text>
    </View>
  );
}

export function InvoiceForm({
  clients,
  invoice,
  defaultClientId = "",
  defaultTaxRate = 0,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  clients: Client[];
  invoice?: InvoiceWithRelations | null;
  defaultClientId?: string;
  defaultTaxRate?: number;
  submitLabel: string;
  onSubmit: (input: InvoiceWriteInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [clientId, setClientId] = useState(
    invoice?.client_id ?? defaultClientId,
  );
  const [status, setStatus] = useState<InvoiceStatus>(
    invoice?.status ?? "draft",
  );
  const [issueDate, setIssueDate] = useState(
    invoice?.issue_date ?? todayISO(),
  );
  const [dueDate, setDueDate] = useState(invoice?.due_date ?? "");
  const [taxRate, setTaxRate] = useState(
    String(invoice?.tax_rate ?? defaultTaxRate),
  );
  const [discountRate, setDiscountRate] = useState(
    String(invoice?.discount_rate ?? 0),
  );
  const [notes, setNotes] = useState(invoice?.notes ?? "");
  const [rows, setRows] = useState<LineRow[]>(() => initialRows(invoice));
  const [errors, setErrors] = useState<InvoiceFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const lineItems = useMemo<InvoiceLineInput[]>(
    () =>
      rows.map((row) => ({
        description: row.description,
        quantity: Number(row.quantity),
        unit_price: Number(row.unitPrice),
      })),
    [rows],
  );
  const numericTaxRate = Number(taxRate);
  const numericDiscountRate = Number(discountRate);
  const totals = useMemo(
    () =>
      calculateInvoiceTotals(
        lineItems,
        Number.isFinite(numericTaxRate) ? numericTaxRate : 0,
        Number.isFinite(numericDiscountRate) ? numericDiscountRate : 0,
      ),
    [lineItems, numericDiscountRate, numericTaxRate],
  );

  function updateRow(key: string, patch: Partial<LineRow>) {
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
  }

  function removeRow(key: string) {
    setRows((current) =>
      current.length === 1
        ? current
        : current.filter((row) => row.key !== key),
    );
  }

  async function save() {
    const input: InvoiceWriteInput = {
      client_id: clientId,
      status,
      issue_date: issueDate.trim(),
      due_date: dueDate.trim() || null,
      tax_rate: numericTaxRate,
      discount_rate: numericDiscountRate,
      notes: notes.trim() || null,
      items: lineItems,
    };
    const nextErrors = validateInvoiceInput(input);
    setErrors(nextErrors);
    setFormError(null);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    try {
      await onSubmit(input);
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Unable to save invoice.",
      );
      setSubmitting(false);
    }
  }

  return (
    <>
      {formError ? (
        <View style={styles.formError}>
          <Ionicons
            name="alert-circle-outline"
            size={20}
            color={colors.danger}
          />
          <Text style={styles.formErrorText}>{formError}</Text>
        </View>
      ) : null}

      <SectionTitle>Details</SectionTitle>
      <Card style={styles.formCard}>
        <ClientPicker
          clients={clients}
          value={clientId}
          error={errors.client_id}
          onChange={setClientId}
        />
        <StatusPicker
          value={status}
          error={errors.status}
          onChange={setStatus}
        />
        <View style={styles.twoColumns}>
          <Field label="Issue date" error={errors.issue_date}>
            <TextInput
              accessibilityLabel="Issue date"
              autoCapitalize="none"
              autoCorrect={false}
              inputMode="numeric"
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.textMuted}
              style={[styles.input, errors.issue_date && styles.inputError]}
              value={issueDate}
              onChangeText={setIssueDate}
            />
          </Field>
          <Field label="Due date" error={errors.due_date}>
            <TextInput
              accessibilityLabel="Due date"
              autoCapitalize="none"
              autoCorrect={false}
              inputMode="numeric"
              placeholder="Optional"
              placeholderTextColor={colors.textMuted}
              style={[styles.input, errors.due_date && styles.inputError]}
              value={dueDate}
              onChangeText={setDueDate}
            />
          </Field>
        </View>
      </Card>

      <SectionTitle
        trailing={
          <Pressable
            accessibilityRole="button"
            onPress={() => setRows((current) => [...current, newRow()])}
            style={({ pressed }) => [
              styles.addButton,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons name="add" size={18} color={colors.accent} />
            <Text style={styles.addButtonText}>Add item</Text>
          </Pressable>
        }
      >
        Line items
      </SectionTitle>
      {errors.items ? <Text style={styles.sectionError}>{errors.items}</Text> : null}
      {rows.map((row, index) => (
        <Card key={row.key} style={styles.lineCard}>
          <View style={styles.lineHeading}>
            <Text style={styles.lineTitle}>Item {index + 1}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remove item ${index + 1}`}
              disabled={rows.length === 1}
              hitSlop={10}
              onPress={() => removeRow(row.key)}
              style={({ pressed }) => [
                styles.removeButton,
                pressed && styles.pressed,
                rows.length === 1 && styles.disabled,
              ]}
            >
              <Ionicons name="trash-outline" size={19} color={colors.danger} />
            </Pressable>
          </View>
          <Field label="Description">
            <TextInput
              accessibilityLabel={`Item ${index + 1} description`}
              placeholder="Design services"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              value={row.description}
              onChangeText={(description) =>
                updateRow(row.key, { description })
              }
            />
          </Field>
          <View style={styles.twoColumns}>
            <Field label="Quantity">
              <TextInput
                accessibilityLabel={`Item ${index + 1} quantity`}
                inputMode="decimal"
                placeholder="1"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
                value={row.quantity}
                onChangeText={(quantity) => updateRow(row.key, { quantity })}
              />
            </Field>
            <Field label="Unit price">
              <TextInput
                accessibilityLabel={`Item ${index + 1} unit price`}
                inputMode="decimal"
                placeholder="0.00"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
                value={row.unitPrice}
                onChangeText={(unitPrice) => updateRow(row.key, { unitPrice })}
              />
            </Field>
          </View>
          <View style={styles.lineAmount}>
            <Text style={styles.summaryLabel}>Amount</Text>
            <Text style={styles.summaryValue}>
              {formatCurrency(
                (Number(row.quantity) || 0) * (Number(row.unitPrice) || 0),
              )}
            </Text>
          </View>
        </Card>
      ))}

      <SectionTitle>Summary</SectionTitle>
      <Card style={styles.formCard}>
        <View style={styles.twoColumns}>
          <Field label="Tax %" error={errors.tax_rate}>
            <TextInput
              accessibilityLabel="Tax percentage"
              inputMode="decimal"
              placeholder="0"
              placeholderTextColor={colors.textMuted}
              style={[styles.input, errors.tax_rate && styles.inputError]}
              value={taxRate}
              onChangeText={setTaxRate}
            />
          </Field>
          <Field label="Discount %" error={errors.discount_rate}>
            <TextInput
              accessibilityLabel="Discount percentage"
              inputMode="decimal"
              placeholder="0"
              placeholderTextColor={colors.textMuted}
              style={[styles.input, errors.discount_rate && styles.inputError]}
              value={discountRate}
              onChangeText={setDiscountRate}
            />
          </Field>
        </View>
        <View style={styles.summary}>
          <SummaryRow label="Subtotal" value={totals.subtotal} />
          <SummaryRow label="Discount" value={-totals.discountAmount} />
          <SummaryRow label="Tax" value={totals.taxAmount} />
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{formatCurrency(totals.total)}</Text>
          </View>
        </View>
      </Card>

      <SectionTitle>Notes</SectionTitle>
      <Card>
        <TextInput
          accessibilityLabel="Invoice notes"
          multiline
          numberOfLines={4}
          placeholder="Payment terms, thank-you note, etc."
          placeholderTextColor={colors.textMuted}
          style={[styles.input, styles.notesInput]}
          textAlignVertical="top"
          value={notes}
          onChangeText={setNotes}
        />
      </Card>

      <View style={styles.actions}>
        <PrimaryButton
          label={submitLabel}
          loading={submitting}
          onPress={() => void save()}
        />
        <PrimaryButton
          label="Cancel"
          disabled={submitting}
          variant="secondary"
          onPress={onCancel}
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  formCard: {
    gap: spacing.lg,
  },
  field: {
    flex: 1,
    gap: spacing.sm,
  },
  fieldLabel: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "600",
  },
  fieldError: {
    color: colors.danger,
    fontSize: 12,
    lineHeight: 17,
  },
  input: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    color: colors.text,
    fontSize: 15,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  inputError: {
    borderColor: colors.danger,
  },
  select: {
    alignItems: "center",
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 48,
    paddingHorizontal: spacing.md,
  },
  selectText: {
    color: colors.text,
    flex: 1,
    fontSize: 15,
  },
  placeholder: {
    color: colors.textMuted,
    flex: 1,
    fontSize: 15,
  },
  twoColumns: {
    flexDirection: "row",
    gap: spacing.md,
  },
  statusRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  statusOption: {
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  statusOptionSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  statusText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "600",
  },
  statusTextSelected: {
    color: colors.white,
  },
  addButton: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  addButtonText: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: "700",
  },
  sectionError: {
    color: colors.danger,
    fontSize: 13,
    marginTop: -spacing.md,
  },
  lineCard: {
    gap: spacing.md,
  },
  lineHeading: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  lineTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  removeButton: {
    padding: spacing.xs,
  },
  disabled: {
    opacity: 0.3,
  },
  lineAmount: {
    alignItems: "center",
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: spacing.md,
  },
  summary: {
    gap: spacing.md,
  },
  summaryRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  summaryLabel: {
    color: colors.textMuted,
    fontSize: 14,
  },
  summaryValue: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
  },
  totalRow: {
    alignItems: "center",
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: spacing.md,
  },
  totalLabel: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  totalValue: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "700",
  },
  notesInput: {
    minHeight: 110,
  },
  actions: {
    gap: spacing.md,
  },
  formError: {
    alignItems: "flex-start",
    backgroundColor: "#3b1418",
    borderColor: colors.danger,
    borderRadius: radius.sm,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md,
  },
  formErrorText: {
    color: colors.text,
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
  },
  modal: {
    backgroundColor: colors.background,
    flex: 1,
  },
  modalHeader: {
    alignItems: "center",
    flexDirection: "row",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  modalTitle: {
    color: colors.text,
    flex: 1,
    fontSize: 17,
    fontWeight: "700",
    textAlign: "center",
  },
  modalSpacer: {
    width: 26,
  },
  searchInput: {
    margin: spacing.lg,
    marginBottom: spacing.sm,
  },
  clientList: {
    padding: spacing.lg,
    paddingTop: spacing.sm,
  },
  clientRow: {
    alignItems: "center",
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    minHeight: 64,
    paddingVertical: spacing.md,
  },
  clientRowSelected: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
  },
  clientRowText: {
    flex: 1,
    gap: spacing.xs,
  },
  clientName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "600",
  },
  clientMeta: {
    color: colors.textMuted,
    fontSize: 13,
  },
  emptyText: {
    color: colors.textMuted,
    padding: spacing.xl,
    textAlign: "center",
  },
  pressed: {
    opacity: 0.65,
  },
});
