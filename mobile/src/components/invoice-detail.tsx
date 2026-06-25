import { StyleSheet, Text, View } from "react-native";

import {
  Card,
  LabelValue,
  MessageState,
  SectionTitle,
  StatusPill,
} from "@/src/components/ui";
import { InvoicePdfButton } from "@/src/components/invoice-pdf";
import {
  effectiveStatus,
  formatCurrency,
  formatDate,
} from "@/src/lib/format";
import { colors, spacing } from "@/src/theme";
import type { InvoiceWithRelations } from "@/src/types/database";

export function InvoiceDetail({ invoice }: { invoice: InvoiceWithRelations }) {
  return (
    <>
      <Card>
        <View style={styles.invoiceHeading}>
          <View>
            <Text style={styles.invoiceNumber}>{invoice.invoice_number}</Text>
            <Text style={styles.clientName}>
              {invoice.client?.company_name ?? "No client"}
            </Text>
          </View>
          <StatusPill status={effectiveStatus(invoice)} />
        </View>
        <LabelValue label="Issued" value={formatDate(invoice.issue_date)} />
        <LabelValue label="Due" value={formatDate(invoice.due_date)} />
        <LabelValue
          label="Subtotal"
          value={formatCurrency(invoice.subtotal)}
        />
        {Number(invoice.discount_amount) > 0 ? (
          <LabelValue
            label={`Discount (${Number(invoice.discount_rate)}%)`}
            value={`-${formatCurrency(invoice.discount_amount)}`}
          />
        ) : null}
        {Number(invoice.tax_amount) > 0 ? (
          <LabelValue
            label={`Tax (${Number(invoice.tax_rate)}%)`}
            value={formatCurrency(invoice.tax_amount)}
          />
        ) : null}
        <LabelValue
          label="Total"
          value={
            <Text style={styles.total}>{formatCurrency(invoice.total)}</Text>
          }
          last
        />
      </Card>

      <InvoicePdfButton invoice={invoice} />

      <SectionTitle>Line items</SectionTitle>
      {invoice.invoice_items.length === 0 ? (
        <MessageState
          title="No line items"
          message="This invoice does not contain any line items."
        />
      ) : (
        <Card>
          {invoice.invoice_items.map((item, index) => (
            <View
              key={item.id}
              style={[
                styles.item,
                index === invoice.invoice_items.length - 1 && styles.lastItem,
              ]}
            >
              <View style={styles.itemDescription}>
                <Text style={styles.itemTitle}>{item.description}</Text>
                <Text style={styles.itemMeta}>
                  {Number(item.quantity)} × {formatCurrency(item.unit_price)}
                </Text>
              </View>
              <Text style={styles.itemAmount}>
                {formatCurrency(Number(item.quantity) * Number(item.unit_price))}
              </Text>
            </View>
          ))}
        </Card>
      )}

      {invoice.notes ? (
        <>
          <SectionTitle>Notes</SectionTitle>
          <Card>
            <Text style={styles.notes}>{invoice.notes}</Text>
          </Card>
        </>
      ) : null}

      {invoice.payments.length > 0 ? (
        <>
          <SectionTitle>Payments</SectionTitle>
          <Card>
            {invoice.payments.map((payment, index) => (
              <LabelValue
                key={payment.id}
                label={formatDate(payment.payment_date)}
                value={formatCurrency(payment.amount)}
                last={index === invoice.payments.length - 1}
              />
            ))}
          </Card>
        </>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  invoiceHeading: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  invoiceNumber: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "700",
  },
  clientName: {
    color: colors.textMuted,
    fontSize: 14,
    marginTop: spacing.xs,
  },
  total: {
    color: colors.text,
    flex: 2,
    fontSize: 18,
    fontWeight: "700",
    textAlign: "right",
  },
  item: {
    alignItems: "center",
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  lastItem: {
    borderBottomWidth: 0,
  },
  itemDescription: {
    flex: 1,
    gap: spacing.xs,
  },
  itemTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
  },
  itemMeta: {
    color: colors.textMuted,
    fontSize: 12,
  },
  itemAmount: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
  },
  notes: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
  },
});
