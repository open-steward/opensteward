import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface FikenInvoiceLine {
  netPrice: number
  vatAmount: number
  grossPrice: number
  description: string
  productId: number
  quantity: number
  unitPrice: number
  vatType: string
  accountCode: string
  [key: string]: unknown
}

export interface FikenInvoice {
  invoiceId: number
  invoiceNumber: string
  customerId: number
  customerName: string
  currency: string
  net: number
  vat: number
  gross: number
  issueDate: string
  dueDate: string
  paid: boolean
  settled: boolean
  invoiceDraftLines: FikenInvoiceLine[]
  kid: string
  bankAccountNumber: string
  [key: string]: unknown
}

function mapStatus(inv: FikenInvoice): InvoiceStatus {
  if (inv.settled) return 'PAID'
  if (inv.paid) return 'PARTIALLY_PAID'
  return 'AUTHORIZED'
}

function mapLineitem(row: FikenInvoiceLine): Lineitem {
  return {
    itemId: row.productId ? String(row.productId) : undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unitPrice,
    unitQuantity: row.quantity,
    totalAmount: row.grossPrice,
    taxAmount: row.vatAmount || undefined,
    accountId: row.accountCode || undefined,
  }
}

export function transformInvoice(raw: FikenInvoice): Invoice {
  return {
    id: String(raw.invoiceId),
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.invoiceNumber || undefined,
    contactId: raw.customerId ? String(raw.customerId) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.gross,
    taxAmount: raw.vat,
    lineItems: (raw.invoiceDraftLines ?? []).map(mapLineitem),
    postedAt: raw.issueDate ? new Date(raw.issueDate) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
