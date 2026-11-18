import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface SellsyInvoiceLine {
  id: string
  product_id: string
  description: string
  quantity: number
  unit_amount: number
  total_amount: number
  tax_id: string
  tax_amount: number
  account_id: string
  [key: string]: unknown
}

export interface SellsyInvoice {
  id: string
  number: string
  contact_id: string
  currency: string
  date: string
  due_date: string
  status: string
  total_amount_untaxed: number
  total_amount: number
  tax_amount: number
  paid_amount: number
  remaining_amount: number
  lines: SellsyInvoiceLine[]
  [key: string]: unknown
}

function mapStatus(inv: SellsyInvoice): InvoiceStatus {
  const s = inv.status?.toLowerCase()
  if (s === 'cancelled' || s === 'voided') return 'VOIDED'
  if (s === 'paid' || (s === 'invoiced' && inv.remaining_amount === 0 && inv.paid_amount > 0))
    return 'PAID'
  if (s === 'partially_paid' || (s === 'invoiced' && inv.paid_amount > 0 && inv.remaining_amount > 0))
    return 'PARTIALLY_PAID'
  if (s === 'invoiced' || s === 'sent') return 'AUTHORIZED'
  return 'DRAFT'
}

function mapLineitem(row: SellsyInvoiceLine): Lineitem {
  return {
    id: row.id,
    accountId: row.account_id || undefined,
    itemId: row.product_id || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unit_amount,
    unitQuantity: row.quantity,
    totalAmount: row.total_amount,
    taxAmount: row.tax_amount || undefined,
    taxrateId: row.tax_id || undefined,
  }
}

export function transformInvoice(raw: SellsyInvoice): Invoice {
  return {
    id: raw.id,
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.number || undefined,
    contactId: raw.contact_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total_amount,
    taxAmount: raw.tax_amount,
    balanceAmount: raw.remaining_amount,
    paidAmount: raw.paid_amount || undefined,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
