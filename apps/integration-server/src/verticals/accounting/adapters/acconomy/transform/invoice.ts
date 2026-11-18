import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface AcconomyInvoiceLine {
  id?: number | string
  description?: string
  qty?: number
  unit_price?: number
  total?: number
  tax?: number
  account_id?: number | string
  [key: string]: unknown
}

export interface AcconomyInvoice {
  id: number | string
  invoice_number?: string
  created_date?: string
  due_date?: string
  subtotal?: number
  tax?: number
  total?: number
  balance?: number
  state?: string
  contact_id?: number | string
  currency?: string
  lines?: AcconomyInvoiceLine[]
  [key: string]: unknown
}

function mapStatus(state?: string): InvoiceStatus {
  switch (state?.toLowerCase()) {
    case 'draft':
      return 'DRAFT'
    case 'issued':
      return 'AUTHORIZED'
    case 'paid':
      return 'PAID'
    case 'voided':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: AcconomyInvoiceLine): Lineitem {
  return {
    id: line.id !== undefined ? String(line.id) : undefined,
    accountId: line.account_id !== undefined ? String(line.account_id) : undefined,
    itemDescription: line.description || undefined,
    unitAmount: line.unit_price,
    unitQuantity: line.qty,
    totalAmount: line.total,
    taxAmount: line.tax || undefined,
  }
}

export function transformInvoice(raw: AcconomyInvoice): Invoice {
  return {
    id: String(raw.id),
    type: 'INVOICE',
    status: mapStatus(raw.state),
    invoiceNumber: raw.invoice_number || undefined,
    contactId: raw.contact_id !== undefined ? String(raw.contact_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total,
    taxAmount: raw.tax,
    balanceAmount: raw.balance,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.created_date ? new Date(raw.created_date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
