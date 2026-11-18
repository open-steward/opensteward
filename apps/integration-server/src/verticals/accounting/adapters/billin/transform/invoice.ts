import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface BillinInvoiceRow {
  id: number
  description: string
  unit_price: number
  quantity: number
  total: number
  tax_amount: number
  account: string
  [key: string]: unknown
}

export interface BillinInvoice {
  id: string
  invoice_number: string
  issue_date: string
  due_date: string
  subtotal: number
  tax_amount: number
  total: number
  remaining: number
  status: string
  client_id: string
  currency: string
  lines: BillinInvoiceRow[]
  [key: string]: unknown
}

function mapStatus(status: string): InvoiceStatus {
  switch (status) {
    case 'sent': return 'AUTHORIZED'
    case 'paid': return 'PAID'
    case 'cancelled': return 'VOIDED'
    default: return 'DRAFT'
  }
}

function mapLineitem(row: BillinInvoiceRow): Lineitem {
  return {
    id: String(row.id),
    accountId: row.account || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unit_price,
    unitQuantity: row.quantity,
    totalAmount: row.total,
    taxAmount: row.tax_amount,
  }
}

export function transformInvoice(raw: BillinInvoice): Invoice {
  return {
    id: raw.id,
    type: 'INVOICE',
    status: mapStatus(raw.status),
    invoiceNumber: raw.invoice_number || undefined,
    contactId: raw.client_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total,
    taxAmount: raw.tax_amount,
    balanceAmount: raw.remaining,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.issue_date ? new Date(raw.issue_date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
