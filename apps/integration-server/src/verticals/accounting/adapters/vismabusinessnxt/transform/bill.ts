import type { Bill, BillStatus } from '../../../schema/bill'

export interface VismaBusinessNxtBill {
  id: string
  invoiceNumber?: string
  supplierId?: string
  invoiceDate?: string
  dueDate?: string
  netAmount?: number
  taxAmount?: number
  grossAmount?: number
  outstandingAmount?: number
  status?: string
  currency?: string
  [key: string]: unknown
}

function mapStatus(raw: VismaBusinessNxtBill): BillStatus {
  switch (raw.status) {
    case 'Open':
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

export function transformBill(raw: VismaBusinessNxtBill): Bill {
  return {
    id: raw.id,
    status: mapStatus(raw),
    billNumber: raw.invoiceNumber || undefined,
    contactId: raw.supplierId || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.grossAmount,
    taxAmount: raw.taxAmount,
    balanceAmount: raw.outstandingAmount,
    postedAt: raw.invoiceDate ? new Date(raw.invoiceDate) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
