import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface PatriotInvoiceLine {
  id: string
  description: string
  quantity: number
  rate: number
  amount: number
  tax_amount: number
  account_id: string
  [key: string]: unknown
}

export interface PatriotInvoice {
  id: string
  number: string
  contact_id: string
  currency: string
  date: string
  due_date: string
  status: string
  total_amount: number
  tax_amount: number
  paid_amount: number
  remaining_amount: number
  lines: PatriotInvoiceLine[]
  [key: string]: unknown
}

function mapStatus(inv: PatriotInvoice): InvoiceStatus {
  const s = inv.status?.toLowerCase()
  if (s === 'void' || s === 'voided') return 'VOIDED'
  if (s === 'paid' || (s === 'approved' && inv.remaining_amount === 0 && inv.paid_amount > 0))
    return 'PAID'
  if (s === 'partially_paid' || (s === 'approved' && inv.paid_amount > 0 && inv.remaining_amount > 0))
    return 'PARTIALLY_PAID'
  if (s === 'approved' || s === 'pending') return 'AUTHORIZED'
  return 'DRAFT'
}

function mapLineitem(row: PatriotInvoiceLine): Lineitem {
  return {
    id: row.id,
    accountId: row.account_id || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.rate,
    unitQuantity: row.quantity,
    totalAmount: row.amount,
    taxAmount: row.tax_amount || undefined,
  }
}

export function transformInvoice(raw: PatriotInvoice): Invoice {
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
