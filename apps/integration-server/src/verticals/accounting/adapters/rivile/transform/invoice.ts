import type { Invoice, InvoiceStatus } from '../../../schema/invoice'

export interface RivileInvoice {
  id: string | number
  document_no: string
  date: string
  due_date?: string
  amount: number
  vat_amount?: number
  state?: string
  client_id?: string | number
  currency?: string
  [key: string]: unknown
}

function mapStatus(state?: string): InvoiceStatus {
  switch (state) {
    case 'I': return 'AUTHORIZED'
    case 'A': return 'PAID'
    case 'S': return 'VOIDED'
    default: return 'DRAFT'
  }
}

export function transformInvoice(raw: RivileInvoice): Invoice {
  return {
    id: String(raw.id),
    type: 'INVOICE',
    status: mapStatus(raw.state),
    invoiceNumber: raw.document_no || undefined,
    contactId: raw.client_id != null ? String(raw.client_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.amount,
    taxAmount: raw.vat_amount,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
