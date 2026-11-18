import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface ProcountorInvoiceRow {
  id: number
  product: string
  description: string
  quantity: number
  unitPrice: number
  sum: number
  vatPercent: number
  accountNumber: string
  [key: string]: unknown
}

export interface ProcountorInvoice {
  id: number
  invoiceNumber: number
  partnerId: number
  currency: string
  date: string
  dueDate: string
  sum: number
  vatAmount: number
  openSum: number
  paidSum: number
  status: string
  invoiceRows: ProcountorInvoiceRow[]
  [key: string]: unknown
}

function mapStatus(status: string): InvoiceStatus {
  switch (status) {
    case 'EMPTY':
    case 'UNFINISHED':
      return 'DRAFT'
    case 'NOTAPPROVED':
    case 'APPROVED':
    case 'SENT':
      return 'AUTHORIZED'
    case 'PAID':
      return 'PAID'
    case 'PARTLYPAID':
      return 'PARTIALLY_PAID'
    case 'CREDITED':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(row: ProcountorInvoiceRow): Lineitem {
  return {
    id: String(row.id),
    accountId: row.accountNumber || undefined,
    itemId: row.product || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unitPrice,
    unitQuantity: row.quantity,
    totalAmount: row.sum,
    taxAmount: row.vatPercent,
  }
}

export function transformInvoice(raw: ProcountorInvoice): Invoice {
  return {
    id: String(raw.id),
    type: 'INVOICE',
    status: mapStatus(raw.status),
    invoiceNumber: String(raw.invoiceNumber),
    contactId: raw.partnerId ? String(raw.partnerId) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.sum,
    taxAmount: raw.vatAmount,
    balanceAmount: raw.openSum,
    paidAmount: raw.paidSum || undefined,
    lineItems: (raw.invoiceRows ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
