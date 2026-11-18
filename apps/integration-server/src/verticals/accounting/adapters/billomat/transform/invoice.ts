import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface BillomatInvoiceLine {
  id: string
  article_id: string
  description: string
  quantity: number
  unit_price: number
  total_gross: number
  tax_rate: number
  tax_amount: number
  account_id: string
  [key: string]: unknown
}

export interface BillomatInvoice {
  id: string
  invoice_number: string
  client_id: string
  currency_code: string
  date: string
  due_date: string
  status: string
  total_gross: number
  total_net: number
  tax_amount: number
  paid_amount: number
  open_amount: number
  invoice_items: BillomatInvoiceLine[]
  [key: string]: unknown
}

function mapStatus(inv: BillomatInvoice): InvoiceStatus {
  const s = inv.status?.toUpperCase()
  if (s === 'CANCELED' || s === 'CANCELLED') return 'VOIDED'
  if (s === 'PAID') return 'PAID'
  if (s === 'OVERDUE') return 'OVERDUE'
  if (s === 'OPEN' && inv.paid_amount > 0) return 'PARTIALLY_PAID'
  if (s === 'OPEN') return 'AUTHORIZED'
  return 'DRAFT'
}

function mapLineitem(row: BillomatInvoiceLine): Lineitem {
  return {
    id: row.id,
    accountId: row.account_id || undefined,
    itemId: row.article_id || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unit_price,
    unitQuantity: row.quantity,
    totalAmount: row.total_gross,
    taxAmount: row.tax_amount || undefined,
  }
}

export function transformInvoice(raw: BillomatInvoice): Invoice {
  return {
    id: raw.id,
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.invoice_number || undefined,
    contactId: raw.client_id || undefined,
    currency: raw.currency_code || undefined,
    totalAmount: raw.total_gross,
    taxAmount: raw.tax_amount,
    paidAmount: raw.paid_amount || undefined,
    balanceAmount: raw.open_amount,
    lineItems: (raw.invoice_items ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
