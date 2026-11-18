import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface LibeoInvoiceRow {
  id: number
  description: string
  unit_price: number
  quantity: number
  net_amount: number
  vat_amount: number
  account_id: string
  [key: string]: unknown
}

export interface LibeoInvoice {
  id: string
  reference: string
  issued_at: string
  due_at: string
  net_amount: number
  vat_amount: number
  total_amount: number
  remaining_amount: number
  state: string
  contact_id: string
  currency: string
  lines: LibeoInvoiceRow[]
  [key: string]: unknown
}

function mapStatus(state: string): InvoiceStatus {
  switch (state) {
    case 'approved': return 'AUTHORIZED'
    case 'paid': return 'PAID'
    case 'cancelled': return 'VOIDED'
    default: return 'DRAFT'
  }
}

function mapLineitem(row: LibeoInvoiceRow): Lineitem {
  return {
    id: String(row.id),
    accountId: row.account_id || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unit_price,
    unitQuantity: row.quantity,
    totalAmount: row.net_amount,
    taxAmount: row.vat_amount,
  }
}

export function transformInvoice(raw: LibeoInvoice): Invoice {
  return {
    id: String(raw.id),
    type: 'INVOICE',
    status: mapStatus(raw.state),
    invoiceNumber: raw.reference || undefined,
    contactId: raw.contact_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total_amount,
    taxAmount: raw.vat_amount,
    balanceAmount: raw.remaining_amount,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.issued_at ? new Date(raw.issued_at) : undefined,
    dueAt: raw.due_at ? new Date(raw.due_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
