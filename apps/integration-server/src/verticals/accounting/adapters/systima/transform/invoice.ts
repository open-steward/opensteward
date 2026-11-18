import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface SystimaLineItem {
  id: string
  description?: string
  quantity?: number
  unitPrice?: number
  amount?: number
  vatAmount?: number
  accountNumber?: string
  [key: string]: unknown
}

export interface SystimaInvoice {
  id: string
  invoiceNumber?: string
  date?: string
  dueDate?: string
  amountExVat?: number
  vatAmount?: number
  amountIncVat?: number
  unpaidAmount?: number
  status?: string
  currency?: string
  customerId?: string
  lines?: SystimaLineItem[]
  [key: string]: unknown
}

function mapStatus(raw: SystimaInvoice): InvoiceStatus {
  switch (raw.status?.toUpperCase()) {
    case 'SENT':
      return 'AUTHORIZED'
    case 'PAID':
      return 'PAID'
    case 'CANCELLED':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(row: SystimaLineItem): Lineitem {
  return {
    id: row.id,
    accountId: row.accountNumber || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unitPrice,
    unitQuantity: row.quantity,
    totalAmount: row.amount,
    taxAmount: row.vatAmount || undefined,
  }
}

export function transformInvoice(raw: SystimaInvoice): Invoice {
  return {
    id: raw.id,
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.invoiceNumber || undefined,
    contactId: raw.customerId || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.amountIncVat,
    taxAmount: raw.vatAmount,
    balanceAmount: raw.unpaidAmount,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
