import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface CegidInvoiceRow {
  id: number
  description: string
  unitPrice: number
  quantity: number
  netAmount: number
  taxAmount: number
  accountId: string
  [key: string]: unknown
}

export interface CegidInvoice {
  id: string
  documentNumber: string
  documentDate: string
  dueDate: string
  netAmount: number
  taxAmount: number
  grossAmount: number
  openAmount: number
  documentStatus: string
  customerId: string
  currency: string
  lines: CegidInvoiceRow[]
  [key: string]: unknown
}

function mapStatus(documentStatus: string): InvoiceStatus {
  switch (documentStatus) {
    case 'Posted': return 'AUTHORIZED'
    case 'Paid': return 'PAID'
    case 'Cancelled': return 'VOIDED'
    default: return 'DRAFT'
  }
}

function mapLineitem(row: CegidInvoiceRow): Lineitem {
  return {
    id: String(row.id),
    accountId: row.accountId || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unitPrice,
    unitQuantity: row.quantity,
    totalAmount: row.netAmount,
    taxAmount: row.taxAmount,
  }
}

export function transformInvoice(raw: CegidInvoice): Invoice {
  return {
    id: String(raw.id),
    type: 'INVOICE',
    status: mapStatus(raw.documentStatus),
    invoiceNumber: raw.documentNumber || undefined,
    contactId: raw.customerId || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.grossAmount,
    taxAmount: raw.taxAmount,
    balanceAmount: raw.openAmount,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.documentDate ? new Date(raw.documentDate) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
