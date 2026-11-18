import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface PennylaneLineItem {
  id: string
  description: string
  quantity: number
  unit_amount: number
  amount: number
}

export interface PennylaneInvoice {
  id: string
  invoice_number: string
  customer: { source_id: string; name: string } | null
  date: string
  deadline: string | null
  currency: string
  amount: number
  amount_cents: number
  remaining_amount: number
  paid_at: string | null
  status: 'draft' | 'not_sent' | 'sent' | 'received' | 'partially_paid' | 'paid' | 'cancelled'
  line_items?: PennylaneLineItem[]
  [key: string]: unknown
}

function mapStatus(raw: PennylaneInvoice): InvoiceStatus {
  switch (raw.status) {
    case 'draft':
      return 'DRAFT'
    case 'not_sent':
    case 'sent':
    case 'received':
      return 'AUTHORIZED'
    case 'partially_paid':
      return 'PARTIALLY_PAID'
    case 'paid':
      return 'PAID'
    case 'cancelled':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: PennylaneLineItem): Lineitem {
  return {
    id: line.id,
    itemDescription: line.description || undefined,
    unitAmount: line.unit_amount,
    unitQuantity: line.quantity,
    totalAmount: line.amount,
  }
}

export function transformInvoice(raw: PennylaneInvoice): Invoice {
  return {
    id: raw.id,
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.invoice_number || undefined,
    contactId: raw.customer?.source_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.amount,
    balanceAmount: raw.remaining_amount,
    paidAt: raw.paid_at ? new Date(raw.paid_at) : undefined,
    lineItems: (raw.line_items ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.deadline ? new Date(raw.deadline) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
