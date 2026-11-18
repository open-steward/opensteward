import type { Invoice, InvoiceStatus } from '../../../schema/invoice'

export interface ICountInvoice {
  doc_id: string
  doc_type: string
  status: string // 'draft' | 'open' | 'paid' | 'cancelled'
  sum: number
  vat_sum: number
  currency_code?: string
  client_id?: string
  date: string
  due_date?: string
  doc_number?: string
  description?: string
  [key: string]: unknown
}

function mapStatus(status: string): InvoiceStatus {
  switch (status) {
    case 'draft': return 'DRAFT'
    case 'open': return 'AUTHORIZED'
    case 'paid': return 'PAID'
    case 'cancelled': return 'VOIDED'
    default: return 'DRAFT'
  }
}

export function transformInvoice(raw: ICountInvoice): Invoice {
  return {
    id: raw.doc_id,
    type: 'INVOICE',
    status: mapStatus(raw.status),
    invoiceNumber: raw.doc_number || undefined,
    contactId: raw.client_id || undefined,
    currency: raw.currency_code || undefined,
    totalAmount: raw.sum,
    taxAmount: raw.vat_sum,
    notes: raw.description as string | undefined,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
