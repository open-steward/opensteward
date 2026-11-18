import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface HoldedInvoiceItem {
  id: string
  name: string
  description: string
  units: number
  subtotal: number
  total: number
  tax: number
  accountId: string
  [key: string]: unknown
}

export interface HoldedInvoice {
  id: string
  invoiceNum: string
  contact: string
  currency: string
  subtotal: number
  tax: number
  total: number
  items: HoldedInvoiceItem[]
  date: number
  dueDate: number
  status: number
  paid: number
  [key: string]: unknown
}

function mapStatus(inv: HoldedInvoice): InvoiceStatus {
  // Holded status: 0 = draft, 1 = accepted/authorized, 2 = paid, 3 = overdue, 4 = voided
  if (inv.status === 4) return 'VOIDED'
  if (inv.status === 3) return 'OVERDUE'
  if (inv.status === 2) return 'PAID'
  if (inv.status === 1 && inv.paid > 0 && inv.paid < inv.total) return 'PARTIALLY_PAID'
  if (inv.status === 1) return 'AUTHORIZED'
  return 'DRAFT'
}

function mapLineitem(row: HoldedInvoiceItem): Lineitem {
  return {
    id: row.id,
    accountId: row.accountId || undefined,
    itemName: row.name || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.subtotal && row.units ? row.subtotal / row.units : undefined,
    unitQuantity: row.units,
    totalAmount: row.total,
    taxAmount: row.tax || undefined,
  }
}

export function transformInvoice(raw: HoldedInvoice): Invoice {
  return {
    id: raw.id,
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.invoiceNum || undefined,
    contactId: raw.contact || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total,
    taxAmount: raw.tax,
    paidAmount: raw.paid || undefined,
    balanceAmount: raw.total - (raw.paid ?? 0),
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date * 1000) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate * 1000) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
