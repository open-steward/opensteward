import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface PandleInvoiceLine {
  id: number
  account_id: number
  description: string
  quantity: number
  unit_price: number
  net_amount: number
  tax_rate_id: number
  tax_amount: number
  total_amount: number
  [key: string]: unknown
}

export interface PandleInvoice {
  id: number
  invoice_number: string
  customer_id: number
  currency: string
  issue_date: string
  due_date: string
  status: string
  net_amount: number
  tax_amount: number
  total_amount: number
  paid_amount: number
  balance: number
  reference: string
  notes: string
  invoice_lines: PandleInvoiceLine[]
  [key: string]: unknown
}

function mapStatus(raw: PandleInvoice): InvoiceStatus {
  const s = raw.status?.toLowerCase()
  if (s === 'void' || s === 'voided') return 'VOIDED'
  if (s === 'paid') return 'PAID'
  if (s === 'part_paid') return 'PARTIALLY_PAID'
  if (s === 'sent' || s === 'authorized') return 'AUTHORIZED'
  if (s === 'draft') return 'DRAFT'
  return 'DRAFT'
}

function mapLineitem(row: PandleInvoiceLine): Lineitem {
  return {
    id: String(row.id),
    accountId: row.account_id ? String(row.account_id) : undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unit_price,
    unitQuantity: row.quantity,
    totalAmount: row.total_amount,
    taxAmount: row.tax_amount || undefined,
    taxrateId: row.tax_rate_id ? String(row.tax_rate_id) : undefined,
  }
}

export function transformInvoice(raw: PandleInvoice): Invoice {
  return {
    id: String(raw.id),
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.invoice_number || undefined,
    contactId: raw.customer_id ? String(raw.customer_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total_amount,
    taxAmount: raw.tax_amount,
    paidAmount: raw.paid_amount || undefined,
    balanceAmount: raw.balance,
    reference: raw.reference || undefined,
    notes: raw.notes || undefined,
    lineItems: (raw.invoice_lines ?? []).map(mapLineitem),
    postedAt: raw.issue_date ? new Date(raw.issue_date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
