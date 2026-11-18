import type { Invoice, InvoiceStatus } from '../../../schema/invoice'

export interface SmartbillInvoice {
  id: string | number
  seriesName?: string
  number: string
  issueDate: string
  dueDate?: string
  totalAmount: number
  totalTax?: number
  status?: string
  clientCif?: string
  currency?: string
  [key: string]: unknown
}

function mapStatus(status?: string): InvoiceStatus {
  switch (status) {
    case 'ISSUED': return 'AUTHORIZED'
    case 'PAID': return 'PAID'
    case 'CANCELLED': return 'VOIDED'
    default: return 'DRAFT'
  }
}

export function transformInvoice(raw: SmartbillInvoice): Invoice {
  const invoiceNumber = raw.seriesName ? `${raw.seriesName}${raw.number}` : raw.number
  return {
    id: String(raw.id),
    type: 'INVOICE',
    status: mapStatus(raw.status),
    invoiceNumber: invoiceNumber || undefined,
    contactId: raw.clientCif || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.totalAmount,
    taxAmount: raw.totalTax,
    postedAt: raw.issueDate ? new Date(raw.issueDate) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
