import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface AkauntingInvoiceLine {
  id: number
  item_id: number
  name: string
  description: string
  quantity: number
  price: number
  total: number
  tax: number
  tax_id: number
  [key: string]: unknown
}

export interface AkauntingInvoice {
  id: number
  document_number: string
  contact_id: number
  contact_name: string
  currency_code: string
  issued_at: string
  due_at: string
  status: string
  amount: number
  tax_total: number
  paid: number
  category_id: number
  items: AkauntingInvoiceLine[]
  [key: string]: unknown
}

function mapStatus(raw: AkauntingInvoice): InvoiceStatus {
  const s = raw.status?.toLowerCase()
  if (s === 'cancelled' || s === 'voided') return 'VOIDED'
  if (s === 'paid') return 'PAID'
  if (s === 'partial') return 'PARTIALLY_PAID'
  if (s === 'sent' || s === 'viewed' || s === 'overdue') return 'SUBMITTED'
  return 'DRAFT'
}

function mapLineitem(row: AkauntingInvoiceLine): Lineitem {
  return {
    id: String(row.id),
    itemId: row.item_id ? String(row.item_id) : undefined,
    itemDescription: row.description || row.name || undefined,
    unitAmount: row.price,
    unitQuantity: row.quantity,
    totalAmount: row.total,
    taxAmount: row.tax || undefined,
    taxrateId: row.tax_id ? String(row.tax_id) : undefined,
  }
}

export function transformInvoice(raw: AkauntingInvoice): Invoice {
  const balance = raw.amount != null && raw.paid != null ? raw.amount - raw.paid : undefined
  return {
    id: String(raw.id),
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.document_number || undefined,
    contactId: raw.contact_id ? String(raw.contact_id) : undefined,
    currency: raw.currency_code || undefined,
    totalAmount: raw.amount,
    taxAmount: raw.tax_total,
    paidAmount: raw.paid || undefined,
    balanceAmount: balance,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.issued_at ? new Date(raw.issued_at) : undefined,
    dueAt: raw.due_at ? new Date(raw.due_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
