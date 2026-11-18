import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface RegateInvoiceLine {
  id: number
  description?: string
  unit_price?: number
  quantity?: number
  amount_excluding_tax?: number
  tax_amount?: number
  account_id?: string
  [key: string]: unknown
}

export interface RegateInvoice {
  id: string
  invoice_number?: string
  invoice_date?: string
  due_date?: string
  amount_excluding_tax?: number
  tax_amount?: number
  total_amount?: number
  outstanding_amount?: number
  status?: string
  contact_id?: string
  currency?: string
  lines?: RegateInvoiceLine[]
  [key: string]: unknown
}

function mapStatus(status?: string): InvoiceStatus {
  switch (status?.toUpperCase()) {
    case 'VALIDATED': return 'AUTHORIZED'
    case 'PAID': return 'PAID'
    case 'CANCELLED': return 'VOIDED'
    case 'DRAFT':
    default: return 'DRAFT'
  }
}

function mapLineitem(row: RegateInvoiceLine): Lineitem {
  return {
    id: String(row.id),
    accountId: row.account_id || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unit_price,
    unitQuantity: row.quantity,
    totalAmount: row.amount_excluding_tax,
    taxAmount: row.tax_amount,
  }
}

export function transformInvoice(raw: RegateInvoice): Invoice {
  return {
    id: String(raw.id),
    type: 'INVOICE',
    status: mapStatus(raw.status),
    invoiceNumber: raw.invoice_number || undefined,
    contactId: raw.contact_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total_amount,
    taxAmount: raw.tax_amount,
    balanceAmount: raw.outstanding_amount,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.invoice_date ? new Date(raw.invoice_date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
