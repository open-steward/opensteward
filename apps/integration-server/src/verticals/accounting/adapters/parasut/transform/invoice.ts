import type { Invoice, InvoiceStatus } from '../../../schema/invoice'

export interface ParasutInvoice {
  id: string
  type: string
  attributes: {
    item_type?: string
    status?: string  // 'draft' | 'sent' | 'cancelled' | 'paid'
    invoice_no?: string
    net_total?: number
    gross_total?: number
    vat_total?: number
    due_date?: string
    issue_date?: string
    currency?: string
  }
  [key: string]: unknown
}

function mapStatus(status?: string): InvoiceStatus {
  switch (status) {
    case 'sent': return 'AUTHORIZED'
    case 'paid': return 'PAID'
    case 'cancelled': return 'VOIDED'
    default: return 'DRAFT'
  }
}

export function transformInvoice(raw: ParasutInvoice): Invoice {
  const attrs = raw.attributes ?? {}
  return {
    id: raw.id,
    type: 'INVOICE',
    status: mapStatus(attrs.status),
    invoiceNumber: attrs.invoice_no || undefined,
    currency: attrs.currency || undefined,
    totalAmount: attrs.gross_total,
    taxAmount: attrs.vat_total,
    postedAt: attrs.issue_date ? new Date(attrs.issue_date) : undefined,
    dueAt: attrs.due_date ? new Date(attrs.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
