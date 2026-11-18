import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface SendRegningLine {
  id: string
  description?: string
  quantity?: number
  unitPrice?: number
  total?: number
  vatAmount?: number
  accountNo?: string
  [key: string]: unknown
}

export interface SendRegningInvoice {
  id: string
  invoiceNo?: string
  invoiceDate?: string
  dueDate?: string
  totalExVat?: number
  totalVat?: number
  total?: number
  outstanding?: number
  status?: string
  currency?: string
  recipientId?: string
  lines?: SendRegningLine[]
  [key: string]: unknown
}

function mapStatus(raw: SendRegningInvoice): InvoiceStatus {
  switch (raw.status?.toLowerCase()) {
    case 'sent':
      return 'AUTHORIZED'
    case 'paid':
      return 'PAID'
    case 'cancelled':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: SendRegningLine): Lineitem {
  return {
    id: line.id,
    accountId: line.accountNo || undefined,
    itemDescription: line.description || undefined,
    unitAmount: line.unitPrice,
    unitQuantity: line.quantity,
    totalAmount: line.total,
    taxAmount: line.vatAmount || undefined,
  }
}

export function transformInvoice(raw: SendRegningInvoice): Invoice {
  return {
    id: raw.id,
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.invoiceNo || undefined,
    contactId: raw.recipientId || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total,
    taxAmount: raw.totalVat,
    balanceAmount: raw.outstanding,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.invoiceDate ? new Date(raw.invoiceDate) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
