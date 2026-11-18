import type { Bill, BillStatus } from '../../../schema/bill'

export interface TeamSystemBill {
  id: string
  documentNumber: string
  documentDate: string
  dueDate: string
  netAmount: number
  taxAmount: number
  totalAmount: number
  openAmount: number
  status: string
  currency: string
  supplierId: string
  [key: string]: unknown
}

function mapStatus(status: string): BillStatus {
  switch (status) {
    case 'Issued': return 'AUTHORIZED'
    case 'Paid': return 'PAID'
    case 'Cancelled': return 'VOIDED'
    default: return 'DRAFT'
  }
}

export function transformBill(raw: TeamSystemBill): Bill {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    billNumber: raw.documentNumber || undefined,
    contactId: raw.supplierId || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.totalAmount,
    taxAmount: raw.taxAmount,
    balanceAmount: raw.openAmount,
    postedAt: raw.documentDate ? new Date(raw.documentDate) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
