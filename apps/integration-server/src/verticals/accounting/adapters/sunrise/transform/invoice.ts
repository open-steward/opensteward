import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface SunriseInvoiceItem {
  id: string
  name: string
  description: string
  quantity: number
  unit_price: number
  amount: number
  tax_amount: number
  account_id: string
  [key: string]: unknown
}

export interface SunriseInvoice {
  id: string
  invoice_number: string
  contact_id: string
  currency: string
  total_amount: number
  tax_amount: number
  paid_amount: number
  balance_amount: number
  line_items: SunriseInvoiceItem[]
  date: string
  due_date: string
  status: string
  [key: string]: unknown
}

function mapStatus(inv: SunriseInvoice): InvoiceStatus {
  const s = inv.status?.toLowerCase() ?? ''
  if (s === 'paid') return 'PAID'
  if (s === 'partial') return 'PARTIALLY_PAID'
  if (s === 'overdue') return 'OVERDUE'
  if (s === 'sent' || s === 'viewed') return 'SUBMITTED'
  if (s === 'void') return 'VOIDED'
  return 'DRAFT'
}

function mapLineitem(row: SunriseInvoiceItem): Lineitem {
  return {
    id: row.id,
    accountId: row.account_id || undefined,
    itemName: row.name || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unit_price || undefined,
    unitQuantity: row.quantity,
    totalAmount: row.amount,
    taxAmount: row.tax_amount || undefined,
  }
}

export function transformInvoice(raw: SunriseInvoice): Invoice {
  return {
    id: raw.id,
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.invoice_number || undefined,
    contactId: raw.contact_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total_amount,
    taxAmount: raw.tax_amount,
    paidAmount: raw.paid_amount || undefined,
    balanceAmount: raw.balance_amount,
    lineItems: (raw.line_items ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
