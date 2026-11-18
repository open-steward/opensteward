import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface WrebitInvoiceLine {
  id?: number | string
  description?: string
  quantity?: number
  unit_price?: number
  total?: number
  vat?: number
  account?: string | number
  [key: string]: unknown
}

export interface WrebitInvoice {
  id: number | string
  ref?: string
  date?: string
  due_date?: string
  net_amount?: number
  vat_amount?: number
  gross_amount?: number
  outstanding?: number
  status?: string
  contact_id?: number | string
  currency?: string
  lines?: WrebitInvoiceLine[]
  [key: string]: unknown
}

function mapStatus(raw: WrebitInvoice): InvoiceStatus {
  switch (raw.status?.toLowerCase()) {
    case 'settled':
      return 'PAID'
    case 'open':
      return 'AUTHORIZED'
    case 'cancelled':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: WrebitInvoiceLine): Lineitem {
  return {
    id: line.id !== undefined ? String(line.id) : undefined,
    accountId: line.account !== undefined ? String(line.account) : undefined,
    itemDescription: line.description || undefined,
    unitAmount: line.unit_price,
    unitQuantity: line.quantity,
    totalAmount: line.total,
    taxAmount: line.vat || undefined,
  }
}

export function transformInvoice(raw: WrebitInvoice): Invoice {
  return {
    id: String(raw.id),
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.ref || undefined,
    contactId: raw.contact_id !== undefined ? String(raw.contact_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.gross_amount,
    taxAmount: raw.vat_amount,
    balanceAmount: raw.outstanding,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
