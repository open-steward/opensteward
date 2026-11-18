import type { Invoice, InvoiceStatus } from '../../../schema/invoice'

export interface JumisInvoice {
  id: string | number
  number: string
  date: string
  due_date?: string
  total: number
  tax?: number
  status?: string
  partner_id?: string | number
  currency?: string
  [key: string]: unknown
}

function mapStatus(status?: string): InvoiceStatus {
  switch (status) {
    case 'issued': return 'AUTHORIZED'
    case 'paid': return 'PAID'
    case 'cancelled': return 'VOIDED'
    default: return 'DRAFT'
  }
}

export function transformInvoice(raw: JumisInvoice): Invoice {
  return {
    id: String(raw.id),
    type: 'INVOICE',
    status: mapStatus(raw.status),
    invoiceNumber: raw.number || undefined,
    contactId: raw.partner_id != null ? String(raw.partner_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total,
    taxAmount: raw.tax,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
