import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface LucaLineItem {
  id: string
  description?: string
  quantity?: number
  unit_price?: number
  total?: number
  vat?: number
  account_no?: string
  [key: string]: unknown
}

export interface LucaInvoice {
  id: string
  invoice_no?: string
  date?: string
  due_date?: string
  subtotal?: number
  vat?: number
  total?: number
  balance?: number
  status?: string
  currency?: string
  customer_id?: string
  lines?: LucaLineItem[]
  [key: string]: unknown
}

function mapStatus(raw: LucaInvoice): InvoiceStatus {
  switch (raw.status?.toLowerCase()) {
    case 'sent':
      return 'AUTHORIZED'
    case 'paid':
      return 'PAID'
    case 'void':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(row: LucaLineItem): Lineitem {
  return {
    id: row.id,
    accountId: row.account_no || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unit_price,
    unitQuantity: row.quantity,
    totalAmount: row.total,
    taxAmount: row.vat || undefined,
  }
}

export function transformInvoice(raw: LucaInvoice): Invoice {
  return {
    id: raw.id,
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.invoice_no || undefined,
    contactId: raw.customer_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total,
    taxAmount: raw.vat,
    balanceAmount: raw.balance,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
