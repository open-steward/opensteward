import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface MoneybirdDetail {
  id: string
  description: string
  amount: string
  price: string
  tax_rate_id: string
  total_price_excl_tax: string
}

export interface MoneybirdInvoice {
  id: string
  invoice_id: string
  contact_id: string
  invoice_date: string
  due_date: string
  currency: string
  total_price_incl_tax: string
  total_price_excl_tax: string
  total_tax: string
  paid_at: string | null
  state: 'draft' | 'open' | 'scheduled' | 'pending_payment' | 'late' | 'paid' | 'uncollectible'
  details?: MoneybirdDetail[]
  [key: string]: unknown
}

function mapStatus(raw: MoneybirdInvoice): InvoiceStatus {
  switch (raw.state) {
    case 'draft':
      return 'DRAFT'
    case 'open':
    case 'scheduled':
    case 'pending_payment':
      return 'AUTHORIZED'
    case 'late':
      return 'OVERDUE'
    case 'paid':
      return 'PAID'
    case 'uncollectible':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(detail: MoneybirdDetail): Lineitem {
  return {
    id: detail.id,
    itemDescription: detail.description || undefined,
    unitAmount: parseFloat(detail.price),
    unitQuantity: parseFloat(detail.amount),
    totalAmount: parseFloat(detail.total_price_excl_tax),
  }
}

export function transformInvoice(raw: MoneybirdInvoice): Invoice {
  return {
    id: raw.id,
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.invoice_id || undefined,
    contactId: raw.contact_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: parseFloat(raw.total_price_incl_tax),
    taxAmount: parseFloat(raw.total_tax),
    paidAt: raw.paid_at ? new Date(raw.paid_at) : undefined,
    lineItems: (raw.details ?? []).map(mapLineitem),
    postedAt: raw.invoice_date ? new Date(raw.invoice_date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
