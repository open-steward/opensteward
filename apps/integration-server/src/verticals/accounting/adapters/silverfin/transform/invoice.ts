import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface SilverfinInvoiceLine {
  id: string | number
  description: string
  quantity: number
  unit_price: number
  total_amount: number
  tax_amount: number
  account_id: string | number
  [key: string]: unknown
}

export interface SilverfinInvoice {
  id: string | number
  status: string
  invoice_number: string
  period: string
  due_date: string
  total_amount: number
  tax_amount: number
  currency: string
  contact_id: string | number
  lines: SilverfinInvoiceLine[]
  [key: string]: unknown
}

function mapStatus(status: string): InvoiceStatus {
  switch (status) {
    case 'approved':
      return 'AUTHORIZED'
    case 'paid':
      return 'PAID'
    case 'cancelled':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: SilverfinInvoiceLine): Lineitem {
  return {
    id: String(line.id),
    accountId: line.account_id ? String(line.account_id) : undefined,
    itemDescription: line.description || undefined,
    unitAmount: line.unit_price,
    unitQuantity: line.quantity,
    totalAmount: line.total_amount,
    taxAmount: line.tax_amount || undefined,
  }
}

export function transformInvoice(raw: SilverfinInvoice): Invoice {
  return {
    id: String(raw.id),
    type: 'INVOICE',
    status: mapStatus(raw.status),
    invoiceNumber: raw.invoice_number || undefined,
    contactId: raw.contact_id ? String(raw.contact_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total_amount,
    taxAmount: raw.tax_amount || undefined,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.period ? new Date(raw.period) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
