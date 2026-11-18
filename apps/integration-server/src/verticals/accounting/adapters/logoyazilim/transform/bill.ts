import type { Bill, BillStatus } from '../../../schema/bill'

// Purchase invoices in Logo have Type='Purchase'
export interface LogoBill {
  id: string
  InvoiceNumber?: string
  InvoiceDate?: string
  DueDate?: string
  TotalAmount?: number
  TaxAmount?: number
  Status?: string  // 'Draft' | 'Approved' | 'Cancelled' | 'Paid'
  CurrencyCode?: string
  ContactId?: string
  Type?: string
  [key: string]: unknown
}

function mapStatus(status?: string): BillStatus {
  switch (status) {
    case 'Approved': return 'AUTHORIZED'
    case 'Paid': return 'PAID'
    case 'Cancelled': return 'VOIDED'
    default: return 'DRAFT'
  }
}

export function transformBill(raw: LogoBill): Bill {
  return {
    id: String(raw.id),
    status: mapStatus(raw.Status),
    billNumber: raw.InvoiceNumber || undefined,
    contactId: raw.ContactId ? String(raw.ContactId) : undefined,
    currency: raw.CurrencyCode || undefined,
    totalAmount: raw.TotalAmount,
    taxAmount: raw.TaxAmount,
    postedAt: raw.InvoiceDate ? new Date(raw.InvoiceDate) : undefined,
    dueAt: raw.DueDate ? new Date(raw.DueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
