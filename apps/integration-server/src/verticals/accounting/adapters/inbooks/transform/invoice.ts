import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface InbooksInvoiceLine {
  id?: number | string
  description?: string
  quantity?: number
  rate?: number
  amount?: number
  tax_amount?: number
  account_id?: number | string
  [key: string]: unknown
}

export interface InbooksInvoice {
  id: number | string
  invoice_number?: string
  invoice_date?: string
  due_date?: string
  sub_total?: number
  tax_amount?: number
  total_amount?: number
  amount_due?: number
  status?: string
  contact_id?: number | string
  currency?: string
  lines?: InbooksInvoiceLine[]
  [key: string]: unknown
}

function mapStatus(raw: InbooksInvoice): InvoiceStatus {
  switch (raw.status) {
    case 'Paid':
      return 'PAID'
    case 'Open':
      return 'AUTHORIZED'
    case 'Void':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: InbooksInvoiceLine): Lineitem {
  return {
    id: line.id !== undefined ? String(line.id) : undefined,
    accountId: line.account_id !== undefined ? String(line.account_id) : undefined,
    itemDescription: line.description || undefined,
    unitAmount: line.rate,
    unitQuantity: line.quantity,
    totalAmount: line.amount,
    taxAmount: line.tax_amount || undefined,
  }
}

export function transformInvoice(raw: InbooksInvoice): Invoice {
  return {
    id: String(raw.id),
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.invoice_number || undefined,
    contactId: raw.contact_id !== undefined ? String(raw.contact_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total_amount,
    taxAmount: raw.tax_amount,
    balanceAmount: raw.amount_due,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.invoice_date ? new Date(raw.invoice_date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
