import type { Invoice, InvoiceStatus } from '../../../schema/invoice'

export interface LogoInvoice {
  id: string
  InvoiceNumber?: string
  InvoiceDate?: string
  DueDate?: string
  TotalAmount?: number
  TaxAmount?: number
  Status?: string  // 'Draft' | 'Approved' | 'Cancelled' | 'Paid'
  CurrencyCode?: string
  CustomerId?: string
  [key: string]: unknown
}

function mapStatus(status?: string): InvoiceStatus {
  switch (status) {
    case 'Approved': return 'AUTHORIZED'
    case 'Paid': return 'PAID'
    case 'Cancelled': return 'VOIDED'
    default: return 'DRAFT'
  }
}

export function transformInvoice(raw: LogoInvoice): Invoice {
  return {
    id: String(raw.id),
    type: 'INVOICE',
    status: mapStatus(raw.Status),
    invoiceNumber: raw.InvoiceNumber || undefined,
    contactId: raw.CustomerId ? String(raw.CustomerId) : undefined,
    currency: raw.CurrencyCode || undefined,
    totalAmount: raw.TotalAmount,
    taxAmount: raw.TaxAmount,
    postedAt: raw.InvoiceDate ? new Date(raw.InvoiceDate) : undefined,
    dueAt: raw.DueDate ? new Date(raw.DueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
