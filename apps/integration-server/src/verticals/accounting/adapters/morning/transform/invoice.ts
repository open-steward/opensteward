import type { Invoice, InvoiceStatus } from '../../../schema/invoice'

export interface MorningDocument {
  id: string
  type: number
  status: number
  number: string
  sum: number
  vat: number
  currency: string
  date: string
  dueDate?: string
  client?: { id?: string }
  description?: string
  [key: string]: unknown
}

function mapStatus(status: number): InvoiceStatus {
  switch (status) {
    case 0: return 'DRAFT'
    case 1: return 'AUTHORIZED'
    case 2: return 'PAID'
    case -1: return 'VOIDED'
    default: return 'DRAFT'
  }
}

export function transformInvoice(raw: MorningDocument): Invoice {
  return {
    id: raw.id,
    type: 'INVOICE',
    status: mapStatus(raw.status),
    invoiceNumber: raw.number,
    contactId: raw.client?.id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.sum,
    taxAmount: raw.vat,
    notes: raw.description as string | undefined,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
