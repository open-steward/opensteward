import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface WintInvoiceLine {
  id?: number | string
  text?: string
  qty?: number
  price?: number
  amount?: number
  vat_amount?: number
  account?: string | number
  [key: string]: unknown
}

export interface WintInvoice {
  id: number | string
  number?: string
  date?: string
  due_date?: string
  net?: number
  vat?: number
  gross?: number
  remaining?: number
  status?: string
  contact_id?: number | string
  currency?: string
  lines?: WintInvoiceLine[]
  [key: string]: unknown
}

function mapStatus(status?: string): InvoiceStatus {
  switch (status?.toLowerCase()) {
    case 'paid':
      return 'PAID'
    case 'sent':
    case 'overdue':
      return 'AUTHORIZED'
    case 'cancelled':
    case 'voided':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: WintInvoiceLine): Lineitem {
  return {
    id: line.id != null ? String(line.id) : undefined,
    accountId: line.account != null ? String(line.account) : undefined,
    itemDescription: line.text || undefined,
    unitAmount: line.price,
    unitQuantity: line.qty,
    totalAmount: line.amount,
    taxAmount: line.vat_amount || undefined,
  }
}

export function transformInvoice(raw: WintInvoice): Invoice {
  return {
    id: String(raw.id),
    type: 'INVOICE',
    status: mapStatus(raw.status),
    invoiceNumber: raw.number || undefined,
    contactId: raw.contact_id != null ? String(raw.contact_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.gross,
    taxAmount: raw.vat,
    balanceAmount: raw.remaining,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
