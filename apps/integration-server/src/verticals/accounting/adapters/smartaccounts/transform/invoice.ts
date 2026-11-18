import type { Invoice, InvoiceStatus } from '../../../schema/invoice'

export interface SmartaccountsInvoice {
  id: string | number
  invoice_number: string
  invoice_date: string
  due_date?: string
  total_amount: number
  vat_amount?: number
  paid_amount?: number
  status?: string
  client_id?: string | number
  currency?: string
  [key: string]: unknown
}

function mapStatus(status?: string): InvoiceStatus {
  switch (status) {
    case 'issued': return 'AUTHORIZED'
    case 'paid': return 'PAID'
    case 'void': return 'VOIDED'
    default: return 'DRAFT'
  }
}

export function transformInvoice(raw: SmartaccountsInvoice): Invoice {
  return {
    id: String(raw.id),
    type: 'INVOICE',
    status: mapStatus(raw.status),
    invoiceNumber: raw.invoice_number || undefined,
    contactId: raw.client_id != null ? String(raw.client_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total_amount,
    taxAmount: raw.vat_amount,
    paidAmount: raw.paid_amount,
    postedAt: raw.invoice_date ? new Date(raw.invoice_date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
