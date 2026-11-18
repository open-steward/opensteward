import type { Bill, BillStatus } from '../../../schema/bill'

export interface VismaNetBill {
  id: string
  invoiceNumber?: string
  supplierId?: string
  invoiceDate?: string
  dueDate?: string
  netAmount?: number
  vatAmount?: number
  grossAmount?: number
  balance?: number
  status?: string
  currency?: string
  [key: string]: unknown
}

function mapStatus(raw: VismaNetBill): BillStatus {
  switch (raw.status) {
    case 'Approved':
      return 'AUTHORIZED'
    case 'Paid':
      return 'PAID'
    case 'Cancelled':
      return 'VOIDED'
    case 'Draft':
    default:
      return 'DRAFT'
  }
}

export function transformBill(raw: VismaNetBill): Bill {
  return {
    id: raw.id,
    status: mapStatus(raw),
    billNumber: raw.invoiceNumber || undefined,
    contactId: raw.supplierId || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.grossAmount,
    taxAmount: raw.vatAmount,
    balanceAmount: raw.balance,
    postedAt: raw.invoiceDate ? new Date(raw.invoiceDate) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
