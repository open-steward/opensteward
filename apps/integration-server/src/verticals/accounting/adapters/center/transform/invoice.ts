import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface CenterInvoiceItem {
  id: string
  name: string
  description: string
  quantity: number
  unitPrice: number
  total: number
  taxAmount: number
  accountId: string
  [key: string]: unknown
}

export interface CenterInvoice {
  id: string
  invoiceNumber: string
  contactId: string
  currency: string
  subtotal: number
  taxAmount: number
  total: number
  items: CenterInvoiceItem[]
  date: string
  dueDate: string
  status: string
  paidAmount: number
  [key: string]: unknown
}

function mapStatus(inv: CenterInvoice): InvoiceStatus {
  const s = inv.status?.toLowerCase() ?? ''
  if (s === 'void' || s === 'voided') return 'VOIDED'
  if (s === 'overdue') return 'OVERDUE'
  if (s === 'paid') return 'PAID'
  if ((s === 'sent' || s === 'submitted') && inv.paidAmount > 0 && inv.paidAmount < inv.total) return 'PARTIALLY_PAID'
  if (s === 'sent' || s === 'submitted') return 'SUBMITTED'
  return 'DRAFT'
}

function mapLineitem(row: CenterInvoiceItem): Lineitem {
  return {
    id: row.id,
    accountId: row.accountId || undefined,
    itemName: row.name || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unitPrice || undefined,
    unitQuantity: row.quantity,
    totalAmount: row.total,
    taxAmount: row.taxAmount || undefined,
  }
}

export function transformInvoice(raw: CenterInvoice): Invoice {
  return {
    id: raw.id,
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.invoiceNumber || undefined,
    contactId: raw.contactId || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total,
    taxAmount: raw.taxAmount,
    paidAmount: raw.paidAmount || undefined,
    balanceAmount: raw.total - (raw.paidAmount ?? 0),
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
