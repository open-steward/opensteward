import type { Invoice, InvoiceStatus } from '../../../schema/invoice'

export interface InvoiceXpressInvoiceStatus {
  name: string
  [key: string]: unknown
}

export interface InvoiceXpressInvoice {
  id: number
  status: InvoiceXpressInvoiceStatus
  sequence_number: string
  date: string
  due_date: string
  currency: string
  total: number
  tax_amount: number
  client: { id: number; [key: string]: unknown }
  [key: string]: unknown
}

function mapStatus(statusName: string): InvoiceStatus {
  switch (statusName) {
    case 'draft': return 'DRAFT'
    case 'sent': return 'AUTHORIZED'
    case 'settled': return 'PAID'
    case 'canceled': return 'VOIDED'
    case 'second_copy': return 'AUTHORIZED'
    default: return 'DRAFT'
  }
}

export function transformInvoice(raw: InvoiceXpressInvoice): Invoice {
  return {
    id: String(raw.id),
    type: 'INVOICE',
    status: mapStatus(raw.status?.name ?? ''),
    invoiceNumber: raw.sequence_number || undefined,
    contactId: raw.client?.id ? String(raw.client.id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total,
    taxAmount: raw.tax_amount || undefined,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
