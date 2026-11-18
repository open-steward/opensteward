import type { Invoice, InvoiceStatus } from '../../../schema/invoice'

export interface MeritaktivaInvoice {
  Id: string | number
  InvoiceNo: string
  DocumentDate: string
  DueDate?: string
  TotalSum: number
  TaxAmount?: number
  Paid?: boolean
  CustomerId?: string | number
  Currency?: string
  [key: string]: unknown
}

function mapStatus(raw: MeritaktivaInvoice): InvoiceStatus {
  if (raw.Paid) return 'PAID'
  return 'DRAFT'
}

export function transformInvoice(raw: MeritaktivaInvoice): Invoice {
  return {
    id: String(raw.Id),
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.InvoiceNo || undefined,
    contactId: raw.CustomerId != null ? String(raw.CustomerId) : undefined,
    currency: raw.Currency || undefined,
    totalAmount: raw.TotalSum,
    taxAmount: raw.TaxAmount,
    postedAt: raw.DocumentDate ? new Date(raw.DocumentDate) : undefined,
    dueAt: raw.DueDate ? new Date(raw.DueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
