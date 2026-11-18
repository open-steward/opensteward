import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface SpeedLedgerInvoiceLine {
  id?: number | string
  description?: string
  quantity?: number
  unitPrice?: number
  amount?: number
  vatAmount?: number
  accountNumber?: string | number
  [key: string]: unknown
}

export interface SpeedLedgerInvoice {
  id: number | string
  invoiceNumber?: string
  invoiceDate?: string
  dueDate?: string
  totalExclVat?: number
  totalVat?: number
  totalInclVat?: number
  balance?: number
  status?: string
  contactId?: number | string
  currency?: string
  lines?: SpeedLedgerInvoiceLine[]
  [key: string]: unknown
}

function mapStatus(raw: SpeedLedgerInvoice): InvoiceStatus {
  switch (raw.status?.toUpperCase()) {
    case 'PAID':
      return 'PAID'
    case 'SENT':
      return 'AUTHORIZED'
    case 'CANCELLED':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: SpeedLedgerInvoiceLine): Lineitem {
  return {
    id: line.id !== undefined ? String(line.id) : undefined,
    accountId: line.accountNumber !== undefined ? String(line.accountNumber) : undefined,
    itemDescription: line.description || undefined,
    unitAmount: line.unitPrice,
    unitQuantity: line.quantity,
    totalAmount: line.amount,
    taxAmount: line.vatAmount || undefined,
  }
}

export function transformInvoice(raw: SpeedLedgerInvoice): Invoice {
  return {
    id: String(raw.id),
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.invoiceNumber || undefined,
    contactId: raw.contactId !== undefined ? String(raw.contactId) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.totalInclVat,
    taxAmount: raw.totalVat,
    balanceAmount: raw.balance,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.invoiceDate ? new Date(raw.invoiceDate) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
