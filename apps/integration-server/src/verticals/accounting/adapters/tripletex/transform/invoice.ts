import type { Invoice, InvoiceStatus } from '../../../schema/invoice'

export interface TripletexInvoice {
  id: number
  invoiceNumber: number
  invoiceDate: string
  customer?: { id: number; name: string }
  invoiceDueDate: string
  amount: number
  amountCurrency: number
  amountExcludingVat: number
  currency?: { id: string; code: string }
  isCreditNote: boolean
  orderLines?: Array<{
    id: number
    description: string
    count: number
    unitPriceExcludingVat: number
    amountExcludingVat: number
    vatType?: { percentage: number }
    product?: { id: number; name: string }
    account?: { id: number; number: number }
  }>
  [key: string]: unknown
}

function mapStatus(inv: TripletexInvoice): InvoiceStatus {
  if (inv.isCreditNote) return 'VOIDED'
  // Tripletex doesn't expose payment status directly in the list response
  // We default to AUTHORIZED for booked invoices
  return 'AUTHORIZED'
}

export function transformInvoice(raw: TripletexInvoice): Invoice {
  return {
    id: String(raw.id),
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.invoiceNumber ? String(raw.invoiceNumber) : undefined,
    contactId: raw.customer?.id ? String(raw.customer.id) : undefined,
    currency: raw.currency?.code || undefined,
    totalAmount: raw.amountCurrency ?? raw.amount,
    lineItems: (raw.orderLines ?? []).map((l) => ({
      id: String(l.id),
      itemDescription: l.description || undefined,
      itemId: l.product?.id ? String(l.product.id) : undefined,
      unitAmount: l.unitPriceExcludingVat,
      unitQuantity: l.count,
      totalAmount: l.amountExcludingVat,
      taxAmount: l.vatType?.percentage
        ? (l.amountExcludingVat * l.vatType.percentage) / 100
        : undefined,
      accountId: l.account?.number ? String(l.account.number) : undefined,
    })),
    postedAt: raw.invoiceDate ? new Date(raw.invoiceDate) : undefined,
    dueAt: raw.invoiceDueDate ? new Date(raw.invoiceDueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
