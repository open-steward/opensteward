import type { Invoice, InvoiceStatus } from '../../../schema/invoice'

// Billingo API v3 Document object
export interface BillingoInvoice {
  id: string | number
  invoice_number?: string
  invoice_date?: string
  fulfillment_date?: string
  gross_total?: number
  net_total?: number
  vat_total?: number
  status?: string
  partner_id?: string | number
  currency?: string
  type?: string
  [key: string]: unknown
}

function mapStatus(status?: string): InvoiceStatus {
  switch (status) {
    case 'issued': return 'AUTHORIZED'
    case 'paid': return 'PAID'
    case 'cancelled': return 'VOIDED'
    case 'draft':
    default: return 'DRAFT'
  }
}

export function transformInvoice(raw: BillingoInvoice): Invoice {
  return {
    id: String(raw.id),
    type: 'INVOICE',
    status: mapStatus(raw.status),
    invoiceNumber: raw.invoice_number || undefined,
    contactId: raw.partner_id != null ? String(raw.partner_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.gross_total,
    taxAmount: raw.vat_total,
    postedAt: raw.invoice_date ? new Date(raw.invoice_date) : undefined,
    dueAt: raw.fulfillment_date ? new Date(raw.fulfillment_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
